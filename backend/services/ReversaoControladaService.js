const { runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const FechamentoMensalService = require('./FechamentoMensalService');
const { MENSALIDADE_STATUS } = require('../constants/domainStates');
const { PERMISSIONS, roleHasPermission } = require('../constants/userRoles');

function exigirMotivo(motivo) {
  const texto = String(motivo || '').trim();
  if (!texto) throw new AppError('motivo e obrigatorio para reversao controlada', 400, 'MOTIVO_OBRIGATORIO');
  return texto;
}

function exigirAtor(actor) {
  if (!actor || !actor.id || !actor.name) {
    throw new AppError('ator responsavel e obrigatorio', 400, 'ATOR_OBRIGATORIO');
  }
  if (!actor.role || !roleHasPermission(actor.role, PERMISSIONS.REVERSAO_EXECUTAR)) {
    throw new AppError('Permissao negada para reversao controlada', 403, 'PERMISSAO_NEGADA');
  }
  return actor;
}

function tipoInverso(tipo) {
  if (tipo === 'receita') return 'despesa';
  if (tipo === 'despesa') return 'receita';
  return 'despesa';
}

async function criarRegistroReversao(tx, { modulo, tipo, registroId, motivo, actor, metadata }) {
  const result = await tx.run(
    `INSERT INTO reversao_controlada
      (modulo, tipo, registro_origem_id, motivo, actor_id, actor_name, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      modulo,
      tipo,
      String(registroId),
      motivo,
      actor.id,
      actor.name,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  return tx.get('SELECT * FROM reversao_controlada WHERE id = ?', [result.lastID]);
}

async function criarLancamentoInverso(tx, { reversao, lancamento, descricao }) {
  if (!lancamento) return null;

  const result = await tx.run(
    `INSERT INTO conta_financeira
      (descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao, origem, origem_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      descricao,
      tipoInverso(lancamento.tipo),
      Number(lancamento.valor || 0),
      new Date().toISOString().slice(0, 10),
      'pago',
      lancamento.plano_contas_id || null,
      `Reversao controlada de ${lancamento.origem || 'conta'} ${lancamento.origem_id || lancamento.id}`,
      'reversao_controlada',
      reversao.id,
    ]
  );

  await tx.run(
    'UPDATE reversao_controlada SET lancamento_inverso_id = ? WHERE id = ?',
    [result.lastID, reversao.id]
  );

  return tx.get('SELECT * FROM conta_financeira WHERE id = ?', [result.lastID]);
}

async function reverterMensalidade(mensalidadeId, payload = {}, actor) {
  const motivo = exigirMotivo(payload.motivo);
  const responsavel = exigirAtor(actor);
  const id = Number(mensalidadeId);
  if (!id) throw new AppError('mensalidade_id invalido', 400, 'MENSALIDADE_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const mensalidade = await tx.get('SELECT * FROM mensalidade WHERE id = ?', [id]);
    if (!mensalidade || mensalidade.deleted_at) {
      throw new AppError('Mensalidade nao encontrada', 404, 'MENSALIDADE_NAO_ENCONTRADA');
    }
    if (mensalidade.reversao_controlada_id) {
      throw new AppError('Mensalidade ja possui reversao controlada', 409, 'MENSALIDADE_JA_REVERTIDA');
    }

    const pagamento = await tx.get('SELECT * FROM pagamento WHERE mensalidade_id = ?', [id]);
    const lancamento = await tx.get(
      "SELECT * FROM conta_financeira WHERE origem = 'mensalidade' AND origem_id = ? AND deleted_at IS NULL",
      [id]
    );
    const dataOperacao = pagamento?.data_pagamento || lancamento?.data_lancamento || mensalidade.updated_at || mensalidade.vencimento;
    await FechamentoMensalService.assertPeriodoEditavelPorData(dataOperacao, 'reversao de mensalidade', tx);

    const reversao = await criarRegistroReversao(tx, {
      modulo: 'mensalidades',
      tipo: 'mensalidade_pagamento',
      registroId: id,
      motivo,
      actor: responsavel,
      metadata: { pagamento_id: pagamento?.id || null, lancamento_id: lancamento?.id || null },
    });

    const lancamentoInverso = await criarLancamentoInverso(tx, {
      reversao,
      lancamento,
      descricao: `Reversao mensalidade ${id}`,
    });

    await tx.run(
      `UPDATE mensalidade
       SET status = ?, reversao_controlada_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [MENSALIDADE_STATUS.EM_REVERSAO_CONTROLADA, reversao.id, id]
    );

    const mensalidadeDepois = await tx.get('SELECT * FROM mensalidade WHERE id = ?', [id]);
    const reversaoDepois = await tx.get('SELECT * FROM reversao_controlada WHERE id = ?', [reversao.id]);

    await AuditService.logAction({
      actor: responsavel,
      action: 'reverter_mensalidade',
      module: 'mensalidades',
      recordType: 'mensalidade',
      recordId: id,
      before: { mensalidade, pagamento, lancamento },
      after: { mensalidade: mensalidadeDepois, reversao: reversaoDepois, lancamento_inverso: lancamentoInverso },
      metadata: { motivo },
    }, tx);

    return { reversao: reversaoDepois, lancamento_inverso: lancamentoInverso, mensalidade: mensalidadeDepois };
  });
}

async function reverterVenda(vendaId, payload = {}, actor) {
  const motivo = exigirMotivo(payload.motivo);
  const responsavel = exigirAtor(actor);
  const id = Number(vendaId);
  if (!id) throw new AppError('venda_id invalido', 400, 'VENDA_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const venda = await tx.get('SELECT * FROM venda_produto WHERE id = ?', [id]);
    if (!venda || venda.deleted_at) throw new AppError('Venda nao encontrada', 404, 'VENDA_NAO_ENCONTRADA');
    if (venda.reversao_controlada_id) throw new AppError('Venda ja possui reversao controlada', 409, 'VENDA_JA_REVERTIDA');

    await FechamentoMensalService.assertPeriodoEditavelPorData(venda.data_venda, 'reversao de venda', tx);

    const produtoAntes = venda.produto_id
      ? await tx.get('SELECT * FROM produto WHERE id = ?', [venda.produto_id])
      : null;
    const lancamento = await tx.get(
      "SELECT * FROM conta_financeira WHERE origem = 'venda_produto' AND origem_id = ? AND deleted_at IS NULL",
      [id]
    );

    const reversao = await criarRegistroReversao(tx, {
      modulo: 'vendas_produtos',
      tipo: 'venda_produto',
      registroId: id,
      motivo,
      actor: responsavel,
      metadata: { produto_id: venda.produto_id, lancamento_id: lancamento?.id || null },
    });

    const lancamentoInverso = await criarLancamentoInverso(tx, {
      reversao,
      lancamento,
      descricao: `Reversao venda ${id}`,
    });

    if (produtoAntes) {
      await tx.run('UPDATE produto SET estoque = estoque + ? WHERE id = ?', [Number(venda.quantidade || 0), venda.produto_id]);
    }

    await tx.run(
      'UPDATE venda_produto SET reversao_controlada_id = ? WHERE id = ?',
      [reversao.id, id]
    );

    const vendaDepois = await tx.get('SELECT * FROM venda_produto WHERE id = ?', [id]);
    const produtoDepois = venda.produto_id
      ? await tx.get('SELECT * FROM produto WHERE id = ?', [venda.produto_id])
      : null;
    const reversaoDepois = await tx.get('SELECT * FROM reversao_controlada WHERE id = ?', [reversao.id]);

    await AuditService.logAction({
      actor: responsavel,
      action: 'reverter_venda_produto',
      module: 'vendas_produtos',
      recordType: 'venda_produto',
      recordId: id,
      before: { venda, produto: produtoAntes, lancamento },
      after: { venda: vendaDepois, produto: produtoDepois, reversao: reversaoDepois, lancamento_inverso: lancamentoInverso },
      metadata: { motivo },
    }, tx);

    return { reversao: reversaoDepois, lancamento_inverso: lancamentoInverso, venda: vendaDepois, produto: produtoDepois };
  });
}

async function reverterContaFinanceira(contaId, payload = {}, actor) {
  const motivo = exigirMotivo(payload.motivo);
  const responsavel = exigirAtor(actor);
  const id = Number(contaId);
  if (!id) throw new AppError('conta_id invalido', 400, 'CONTA_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const conta = await tx.get('SELECT * FROM conta_financeira WHERE id = ?', [id]);
    if (!conta || conta.deleted_at) throw new AppError('Conta financeira nao encontrada', 404, 'CONTA_NAO_ENCONTRADA');
    if (conta.reversao_controlada_id) throw new AppError('Conta ja possui reversao controlada', 409, 'CONTA_JA_REVERTIDA');

    await FechamentoMensalService.assertPeriodoEditavelPorData(conta.data_lancamento, 'reversao de conta financeira', tx);

    const reversao = await criarRegistroReversao(tx, {
      modulo: 'contas_financeiras',
      tipo: 'conta_financeira',
      registroId: id,
      motivo,
      actor: responsavel,
      metadata: { conta_status: conta.status, conta_tipo: conta.tipo },
    });

    const lancamentoInverso = await criarLancamentoInverso(tx, {
      reversao,
      lancamento: conta,
      descricao: `Reversao conta financeira ${id}`,
    });

    await tx.run(
      'UPDATE conta_financeira SET reversao_controlada_id = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [reversao.id, id]
    );

    const contaDepois = await tx.get('SELECT * FROM conta_financeira WHERE id = ?', [id]);
    const reversaoDepois = await tx.get('SELECT * FROM reversao_controlada WHERE id = ?', [reversao.id]);

    await AuditService.logAction({
      actor: responsavel,
      action: 'reverter_conta_financeira',
      module: 'contas_financeiras',
      recordType: 'conta_financeira',
      recordId: id,
      before: conta,
      after: { conta: contaDepois, reversao: reversaoDepois, lancamento_inverso: lancamentoInverso },
      metadata: { motivo },
    }, tx);

    return { reversao: reversaoDepois, lancamento_inverso: lancamentoInverso, conta: contaDepois };
  });
}

module.exports = {
  reverterMensalidade,
  reverterVenda,
  reverterContaFinanceira,
};
