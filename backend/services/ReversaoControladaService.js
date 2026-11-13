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

// S1-P0 (FV-02a): toda reversao exige o escopo da operacao. Sem ele, as
// consultas abaixo buscariam o registro so pelo id, em qualquer Rede.
function exigirEscopo(scope) {
  if (!scope?.tenant_id || !scope?.unit_id) {
    throw new AppError('Escopo de rede/unidade obrigatorio para reversao controlada', 403, 'ESCOPO_OBRIGATORIO');
  }
  return { tenant_id: Number(scope.tenant_id), unit_id: Number(scope.unit_id) };
}

// O registro da reversao leva a Rede/Unidade do escopo, nao a do ator.
function atorNoEscopo(actor, scope) {
  return { ...exigirAtor(actor), tenant_id: scope.tenant_id, unit_id: scope.unit_id };
}

function tipoInverso(tipo) {
  if (tipo === 'receita') return 'despesa';
  if (tipo === 'despesa') return 'receita';
  return 'despesa';
}

function exigirAprovacaoReversao() {
  throw new AppError(
    'A reversao exige solicitacao, aprovacao e execucao registradas.',
    409,
    'REVERSAO_APROVACAO_NECESSARIA'
  );
}

async function criarRegistroReversao(tx, dados) {
  exigirAprovacaoReversao();
  return inserirRegistroReversao(tx, dados);
}

// Grava o registro da reversao. So o fluxo com aprovacao consumida (estorno de
// venda, L04) chama direto; os demais tipos continuam bloqueados acima.
async function inserirRegistroReversao(tx, { modulo, tipo, registroId, motivo, actor, metadata }) {
  const result = await tx.run(
    `INSERT INTO reversao_controlada
      (modulo, tipo, registro_origem_id, motivo, actor_id, actor_name, metadata_json, tenant_id, unit_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      modulo,
      tipo,
      String(registroId),
      motivo,
      actor.id,
      actor.name,
      metadata ? JSON.stringify(metadata) : null,
      actor.tenant_id || null,
      actor.unit_id || null,
    ]
  );

  return tx.get('SELECT * FROM reversao_controlada WHERE id = ?', [result.lastID]);
}

async function criarLancamentoInverso(tx, { reversao, lancamento, descricao, dataLancamento = null }) {
  if (!lancamento) return null;

  // Reversao controlada nao apaga efeito financeiro anterior: ela cria a
  // contrapartida auditavel que preserva rastreabilidade contabil.
  // A contrapartida so herda a categoria se ela for da Rede do lancamento.
  const { categoriaDaRede } = require('./FinanceiroService');
  const tenantLancamento = lancamento.tenant_id || reversao.tenant_id || null;
  const categoria = await categoriaDaRede(lancamento.plano_contas_id, tenantLancamento, tx);
  const result = await tx.run(
    `INSERT INTO conta_financeira
      (descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao, origem, origem_id, tenant_id, unit_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      descricao,
      tipoInverso(lancamento.tipo),
      Number(lancamento.valor || 0),
      dataLancamento || new Date().toISOString().slice(0, 10),
      'pago',
      categoria,
      `Reversao controlada de ${lancamento.origem || 'conta'} ${lancamento.origem_id || lancamento.id}`,
      'reversao_controlada',
      reversao.id,
      lancamento.tenant_id || reversao.tenant_id || null,
      lancamento.unit_id || reversao.unit_id || null,
    ]
  );

  await tx.run(
    'UPDATE reversao_controlada SET lancamento_inverso_id = ? WHERE id = ?',
    [result.lastID, reversao.id]
  );

  return tx.get('SELECT * FROM conta_financeira WHERE id = ?', [result.lastID]);
}

async function reverterMensalidade(mensalidadeId, payload = {}, actor, scope = null) {
  scope = exigirEscopo(scope);
  const motivo = exigirMotivo(payload.motivo);
  const responsavel = atorNoEscopo(actor, scope);
  const id = Number(mensalidadeId);
  if (!id) throw new AppError('mensalidade_id invalido', 400, 'MENSALIDADE_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const mensalidade = scope?.tenant_id && scope?.unit_id
      ? await tx.get('SELECT * FROM mensalidade WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id])
      : await tx.get('SELECT * FROM mensalidade WHERE id = ?', [id]);
    if (!mensalidade || mensalidade.deleted_at) {
      throw new AppError('Mensalidade nao encontrada', 404, 'MENSALIDADE_NAO_ENCONTRADA');
    }
    if (mensalidade.reversao_controlada_id) {
      throw new AppError('Mensalidade ja possui reversao controlada', 409, 'MENSALIDADE_JA_REVERTIDA');
    }

    // GS-07 P1: mensalidade com pagamentos no modelo novo (lancamento por
    // pagamento) e estornada pagamento a pagamento, nunca em bloco.
    const pagamentoNovo = await tx.get(
      'SELECT id FROM pagamento WHERE mensalidade_id = ? AND lancamento_id IS NOT NULL LIMIT 1',
      [id]
    );
    if (pagamentoNovo) {
      throw new AppError(
        'Esta mensalidade usa pagamentos individuais: estorne cada pagamento em POST /pagamentos/:id/estornar',
        409,
        'USAR_ESTORNO_POR_PAGAMENTO'
      );
    }

    const pagamento = scope?.tenant_id && scope?.unit_id
      ? await tx.get('SELECT * FROM pagamento WHERE mensalidade_id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id])
      : await tx.get('SELECT * FROM pagamento WHERE mensalidade_id = ?', [id]);
    const lancamento = await tx.get(
      `SELECT * FROM conta_financeira
       WHERE origem = 'mensalidade' AND origem_id = ? AND deleted_at IS NULL
       ${scope?.tenant_id && scope?.unit_id ? 'AND tenant_id = ? AND unit_id = ?' : ''}`,
      scope?.tenant_id && scope?.unit_id ? [id, scope.tenant_id, scope.unit_id] : [id]
    );
    const dataOperacao = pagamento?.data_pagamento || lancamento?.data_lancamento || mensalidade.updated_at || mensalidade.vencimento;
    await FechamentoMensalService.assertPeriodoEditavelPorData(dataOperacao, 'reversao de mensalidade', tx, scope);

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
      tenant_id: scope?.tenant_id,
      unit_id: scope?.unit_id,
    }, tx);

    return { reversao: reversaoDepois, lancamento_inverso: lancamentoInverso, mensalidade: mensalidadeDepois };
  });
}

async function reverterVenda(vendaId, payload = {}, actor, scope = null) {
  scope = exigirEscopo(scope);
  const motivo = exigirMotivo(payload.motivo);
  const responsavel = atorNoEscopo(actor, scope);
  const id = Number(vendaId);
  if (!id) throw new AppError('venda_id invalido', 400, 'VENDA_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const venda = scope?.tenant_id && scope?.unit_id
      ? await tx.get('SELECT * FROM venda_produto WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id])
      : await tx.get('SELECT * FROM venda_produto WHERE id = ?', [id]);
    if (!venda || venda.deleted_at) throw new AppError('Venda nao encontrada', 404, 'VENDA_NAO_ENCONTRADA');
    if (venda.reversao_controlada_id) throw new AppError('Venda ja possui reversao controlada', 409, 'VENDA_JA_REVERTIDA');

    await FechamentoMensalService.assertPeriodoEditavelPorData(venda.data_venda, 'reversao de venda', tx, scope);

    const produtoAntes = venda.produto_id
      ? (scope?.tenant_id && scope?.unit_id
        ? await tx.get('SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?', [venda.produto_id, scope.tenant_id, scope.unit_id])
        : await tx.get('SELECT * FROM produto WHERE id = ?', [venda.produto_id]))
      : null;
    const lancamento = await tx.get(
      `SELECT * FROM conta_financeira
       WHERE origem = 'venda_produto' AND origem_id = ? AND deleted_at IS NULL
       ${scope?.tenant_id && scope?.unit_id ? 'AND tenant_id = ? AND unit_id = ?' : ''}`,
      scope?.tenant_id && scope?.unit_id ? [id, scope.tenant_id, scope.unit_id] : [id]
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
      if (scope?.tenant_id && scope?.unit_id) {
        await tx.run('UPDATE produto SET estoque = estoque + ? WHERE id = ? AND tenant_id = ? AND unit_id = ?', [Number(venda.quantidade || 0), venda.produto_id, scope.tenant_id, scope.unit_id]);
      } else {
        await tx.run('UPDATE produto SET estoque = estoque + ? WHERE id = ?', [Number(venda.quantidade || 0), venda.produto_id]);
      }
    }

    await tx.run(
      'UPDATE venda_produto SET reversao_controlada_id = ? WHERE id = ?',
      [reversao.id, id]
    );

    const vendaDepois = await tx.get('SELECT * FROM venda_produto WHERE id = ?', [id]);
    const produtoDepois = venda.produto_id
      ? (scope?.tenant_id && scope?.unit_id
        ? await tx.get('SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?', [venda.produto_id, scope.tenant_id, scope.unit_id])
        : await tx.get('SELECT * FROM produto WHERE id = ?', [venda.produto_id]))
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
      tenant_id: scope?.tenant_id,
      unit_id: scope?.unit_id,
    }, tx);

    return { reversao: reversaoDepois, lancamento_inverso: lancamentoInverso, venda: vendaDepois, produto: produtoDepois };
  });
}

async function reverterContaFinanceira(contaId, payload = {}, actor, scope = null) {
  scope = exigirEscopo(scope);
  const motivo = exigirMotivo(payload.motivo);
  const responsavel = atorNoEscopo(actor, scope);
  const id = Number(contaId);
  if (!id) throw new AppError('conta_id invalido', 400, 'CONTA_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const conta = scope?.tenant_id && scope?.unit_id
      ? await tx.get('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id])
      : await tx.get('SELECT * FROM conta_financeira WHERE id = ?', [id]);
    if (!conta || conta.deleted_at) throw new AppError('Conta financeira nao encontrada', 404, 'CONTA_NAO_ENCONTRADA');
    if (conta.reversao_controlada_id) throw new AppError('Conta ja possui reversao controlada', 409, 'CONTA_JA_REVERTIDA');
    // S1-P0 (FV-02a): lancamento derivado (venda, mensalidade, pagamento,
    // outra reversao) so se desfaz pelo fluxo de origem. Antes, so a rota
    // /contas-financeiras/:id/reverter checava; a rota /reversoes nao.
    if (String(conta.origem || '').trim() !== 'conta_financeira') {
      throw new AppError(
        'Lancamento financeiro derivado deve ser alterado pelo fluxo de origem ou reversao apropriada.',
        409,
        'CONTA_FINANCEIRA_DERIVADA_PROTEGIDA'
      );
    }

    await FechamentoMensalService.assertPeriodoEditavelPorData(conta.data_lancamento, 'reversao de conta financeira', tx, scope);

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
      tenant_id: scope?.tenant_id,
      unit_id: scope?.unit_id,
    }, tx);

    return { reversao: reversaoDepois, lancamento_inverso: lancamentoInverso, conta: contaDepois };
  });
}

// GS-07 P1 (D7): estorna somente o pagamento indicado, integral ou parcial.
// A competencia (vencimento, data_inicio, data_fim) nao muda; o status e
// recalculado pelo saldo dos pagamentos validos restantes. O efeito
// financeiro e desfeito pelo lancamento inverso, preservando o original.
async function estornarPagamento(pagamentoId, payload = {}, actor, scope = null) {
  const motivo = exigirMotivo(payload.motivo);
  const responsavel = exigirAtor(actor);
  const id = Number(pagamentoId);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('pagamento_id invalido', 400, 'PAGAMENTO_ID_INVALIDO');
  if (!scope?.tenant_id || !scope?.unit_id) {
    throw new AppError('Escopo de rede/unidade obrigatorio para estorno', 403, 'ESCOPO_OBRIGATORIO');
  }
  // Import tardio: evita ciclo de require com MensalidadeService.
  const MensalidadeService = require('./MensalidadeService');

  return runTransaction(async (tx) => {
    const pagamento = await tx.get(
      'SELECT * FROM pagamento WHERE id = ? AND tenant_id = ? AND unit_id = ?',
      [id, scope.tenant_id, scope.unit_id]
    );
    if (!pagamento) throw new AppError('Pagamento nao encontrado', 404, 'PAGAMENTO_NAO_ENCONTRADO');
    if (pagamento.estornado_em) {
      throw new AppError('Pagamento ja estornado', 409, 'PAGAMENTO_JA_ESTORNADO', {
        reversao_controlada_id: pagamento.reversao_controlada_id,
      });
    }

    const mensalidade = await tx.get(
      'SELECT * FROM mensalidade WHERE id = ? AND tenant_id = ? AND unit_id = ?',
      [pagamento.mensalidade_id, scope.tenant_id, scope.unit_id]
    );
    if (!mensalidade || mensalidade.deleted_at) {
      throw new AppError('Mensalidade do pagamento nao encontrada', 404, 'MENSALIDADE_NAO_ENCONTRADA');
    }
    if (mensalidade.reversao_controlada_id || mensalidade.status === MENSALIDADE_STATUS.EM_REVERSAO_CONTROLADA) {
      throw new AppError('Mensalidade ja possui reversao controlada', 409, 'MENSALIDADE_JA_REVERTIDA');
    }

    // Fechamento: o periodo do pagamento original e o periodo de hoje (data
    // do lancamento inverso) precisam estar abertos.
    const hoje = new Date().toISOString().slice(0, 10);
    await FechamentoMensalService.assertPeriodoEditavelPorData(pagamento.data_pagamento || hoje, 'estorno de pagamento', tx, scope);
    await FechamentoMensalService.assertPeriodoEditavelPorData(hoje, 'estorno de pagamento', tx, scope);

    const antes = await MensalidadeService.resumoSaldoMensalidade(tx, mensalidade);

    const lancamentoOriginal = pagamento.lancamento_id
      ? await tx.get('SELECT * FROM conta_financeira WHERE id = ? AND deleted_at IS NULL', [pagamento.lancamento_id])
      : await tx.get(
        `SELECT * FROM conta_financeira
         WHERE origem = 'mensalidade' AND origem_id = ? AND tenant_id = ? AND unit_id = ? AND deleted_at IS NULL`,
        [mensalidade.id, scope.tenant_id, scope.unit_id]
      );

    const reversao = await criarRegistroReversao(tx, {
      modulo: 'pagamentos',
      tipo: 'pagamento_mensalidade',
      registroId: id,
      motivo,
      actor: responsavel,
      metadata: {
        pagamento_id: id,
        mensalidade_id: mensalidade.id,
        valor_estornado: Number(pagamento.valor_pago),
        lancamento_id: lancamentoOriginal?.id || null,
      },
    });

    // A contrapartida usa o valor do pagamento, mesmo quando o lancamento de
    // origem e o agregado legado da mensalidade.
    const lancamentoInverso = await criarLancamentoInverso(tx, {
      reversao,
      lancamento: lancamentoOriginal ? { ...lancamentoOriginal, valor: Number(pagamento.valor_pago) } : null,
      descricao: `Estorno do pagamento ${id} da mensalidade ${mensalidade.id}`,
    });

    await tx.run(
      `UPDATE pagamento
       SET estornado_em = datetime('now'), estornado_por = ?, reversao_controlada_id = ?
       WHERE id = ?`,
      [responsavel.id, reversao.id, id]
    );

    const depois = await MensalidadeService.resumoSaldoMensalidade(tx, mensalidade);
    const novoStatus = MensalidadeService.statusPorSaldo(depois.valorCobradoCentavos, depois.pagoCentavos, mensalidade.status);
    await tx.run('UPDATE mensalidade SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [novoStatus, mensalidade.id]);

    const mensalidadeDepois = await tx.get('SELECT * FROM mensalidade WHERE id = ?', [mensalidade.id]);
    const pagamentoDepois = await tx.get('SELECT * FROM pagamento WHERE id = ?', [id]);
    const reversaoDepois = await tx.get('SELECT * FROM reversao_controlada WHERE id = ?', [reversao.id]);

    const saldo = {
      valor_cobrado: depois.valor_cobrado,
      total_pago: depois.total_pago,
      saldo_em_aberto: depois.saldo_em_aberto,
    };

    await AuditService.logAction({
      actor: responsavel,
      action: 'estornar_pagamento_mensalidade',
      module: 'pagamentos',
      recordType: 'pagamento',
      recordId: id,
      before: {
        pagamento,
        mensalidade,
        saldo: { total_pago: antes.total_pago, saldo_em_aberto: antes.saldo_em_aberto },
      },
      after: { pagamento: pagamentoDepois, mensalidade: mensalidadeDepois, reversao: reversaoDepois, lancamento_inverso: lancamentoInverso, saldo },
      metadata: { motivo, mensalidade_id: mensalidade.id, valor_estornado: Number(pagamento.valor_pago) },
      tenant_id: scope.tenant_id,
      unit_id: scope.unit_id,
    }, tx);

    return {
      pagamento: pagamentoDepois,
      mensalidade: mensalidadeDepois,
      reversao: reversaoDepois,
      lancamento_inverso: lancamentoInverso,
      ...saldo,
      status_mensalidade: novoStatus,
    };
  });
}

module.exports = {
  inserirRegistroReversao,
  criarLancamentoInverso,
  estornarPagamento,
  reverterMensalidade,
  reverterVenda,
  reverterContaFinanceira,
};
