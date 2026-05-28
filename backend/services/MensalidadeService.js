const { runGet, runExecute, runQuery, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const { MENSALIDADE_STATUS, MENSALIDADE_STATUS_VALUES } = require('../constants/domainStates');
const AuditService = require('./AuditService');
const FechamentoMensalService = require('./FechamentoMensalService');
const FinanceiroService = require('./FinanceiroService');

function isISODate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function toMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfCycle(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function buildDueDate(day, baseDateStr) {
  const base = new Date(`${baseDateStr}T12:00:00`);
  const year = base.getFullYear();
  const month = base.getMonth();
  const maxDay = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(Math.max(Number(day) || 1, 1), maxDay);
  return new Date(year, month, safeDay).toISOString().slice(0, 10);
}

async function validarAlunoCobravel(alunoId, scope = null) {
  const vinculo = scope?.tenant_id && scope?.unit_id
    ? await runGet('SELECT responsavel_id FROM plano_associado WHERE aluno_id = ? AND tenant_id = ? AND unit_id = ? LIMIT 1', [alunoId, scope.tenant_id, scope.unit_id])
    : await runGet('SELECT responsavel_id FROM plano_associado WHERE aluno_id = ? LIMIT 1', [alunoId]);
  if (vinculo) {
    throw new AppError(
      'Aluno vinculado nao pode possuir mensalidade propria. A cobranca deve ser feita no responsavel.',
      400,
      'ALUNO_VINCULADO_NAO_COBRAVEL'
    );
  }
}

function validarStatusMensalidade(status) {
  const statusNormalizado = String(status || MENSALIDADE_STATUS.EM_ABERTO).toLowerCase();
  if (!MENSALIDADE_STATUS_VALUES.includes(statusNormalizado)) {
    throw new AppError(
      `status invalido. Use: ${MENSALIDADE_STATUS_VALUES.join(', ')}`,
      400,
      'MENSALIDADE_STATUS_INVALIDO'
    );
  }
  return statusNormalizado;
}

async function criarMensalidade(payload = {}, scope = null) {
  const {
    aluno_id,
    plano_id,
    valor_cobrado,
    desconto_aplicado = 0,
    data_inicio,
    vencimento,
    observacoes = '',
    status = MENSALIDADE_STATUS.EM_ABERTO,
  } = payload;

  if (!aluno_id) throw new AppError('aluno_id e obrigatorio', 400, 'ALUNO_ID_OBRIGATORIO');

  const aluno = scope?.tenant_id && scope?.unit_id
    ? await runGet('SELECT * FROM aluno WHERE id = ? AND tenant_id = ? AND unit_id = ?', [aluno_id, scope.tenant_id, scope.unit_id])
    : await runGet('SELECT * FROM aluno WHERE id = ?', [aluno_id]);
  if (!aluno) throw new AppError('Aluno nao encontrado', 404, 'ALUNO_NAO_ENCONTRADO');

  await validarAlunoCobravel(aluno_id, scope);

  const planoIdFinal = Number(plano_id || aluno.plano_id);
  if (!planoIdFinal) throw new AppError('plano_id e obrigatorio', 400, 'PLANO_ID_OBRIGATORIO');

  const plano = scope?.tenant_id
    ? await runGet('SELECT * FROM plano WHERE id = ? AND tenant_id = ?', [planoIdFinal, scope.tenant_id])
    : await runGet('SELECT * FROM plano WHERE id = ?', [planoIdFinal]);
  if (!plano) throw new AppError('Plano nao encontrado', 400, 'PLANO_NAO_ENCONTRADO');

  const hoje = new Date().toISOString().slice(0, 10);
  const venc = isISODate(vencimento) ? vencimento : buildDueDate(aluno.dia_vencimento, hoje);
  const inicioCiclo = isISODate(data_inicio) ? data_inicio : startOfCycle(venc);
  const dataFim = addDays(inicioCiclo, Math.max(0, Number(plano.duracao_em_dias || 30) - 1));

  const valorBase = toMoney(valor_cobrado ?? plano.valor_base ?? plano.valor);
  if (valorBase === null || valorBase <= 0) {
    throw new AppError('valor_cobrado invalido', 400, 'VALOR_COBRADO_INVALIDO');
  }

  const desconto = toMoney(desconto_aplicado) ?? 0;
  if (desconto < 0) throw new AppError('desconto_aplicado invalido', 400, 'DESCONTO_INVALIDO');
  if (desconto >= valorBase) {
    throw new AppError(
      'desconto_aplicado nao pode ser maior ou igual ao valor cobrado',
      400,
      'DESCONTO_MAIOR_QUE_VALOR'
    );
  }

  const statusNormalizado = validarStatusMensalidade(status);
  await FechamentoMensalService.assertPeriodoEditavelPorData(venc, 'criacao de mensalidade', null, scope);
  const duplicada = await runGet(
    `SELECT id FROM mensalidade
     WHERE aluno_id = ?
       ${scope?.tenant_id && scope?.unit_id ? 'AND tenant_id = ? AND unit_id = ?' : ''}
       AND strftime('%Y-%m', vencimento) = strftime('%Y-%m', ?)
       AND status != ?`,
    scope?.tenant_id && scope?.unit_id
      ? [aluno_id, scope.tenant_id, scope.unit_id, venc, MENSALIDADE_STATUS.CANCELADO]
      : [aluno_id, venc, MENSALIDADE_STATUS.CANCELADO]
  );
  if (duplicada) {
    throw new AppError('Ja existe mensalidade para este aluno neste ciclo', 409, 'MENSALIDADE_DUPLICADA');
  }

  const result = await runExecute(
    `INSERT INTO mensalidade
      (aluno_id, plano_id, valor_cobrado, desconto_aplicado, status, data_inicio, data_fim, vencimento, observacoes, tenant_id, unit_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [aluno_id, planoIdFinal, valorBase, desconto, statusNormalizado, inicioCiclo, dataFim, venc, observacoes || '', scope?.tenant_id || aluno.tenant_id || null, scope?.unit_id || aluno.unit_id || null]
  );

  return runGet('SELECT * FROM mensalidade WHERE id = ?', [result.lastID]);
}

async function listarMensalidades(filtros = {}, scope = null) {
  let sql = `
    SELECT m.*, a.nome AS aluno_nome, p.nome AS plano_nome
    FROM mensalidade m
    LEFT JOIN aluno a ON a.id = m.aluno_id
    LEFT JOIN plano p ON p.id = m.plano_id
    WHERE m.deleted_at IS NULL`;
  const params = [];

  if (scope?.tenant_id && scope?.unit_id) {
    sql += ' AND m.tenant_id = ? AND m.unit_id = ?';
    params.push(scope.tenant_id, scope.unit_id);
  }

  if (filtros.aluno_id) {
    sql += ' AND m.aluno_id = ?';
    params.push(filtros.aluno_id);
  }
  if (filtros.plano_id) {
    sql += ' AND m.plano_id = ?';
    params.push(filtros.plano_id);
  }
  if (filtros.status) {
    sql += ' AND m.status = ?';
    params.push(filtros.status);
  }
  if (filtros.vencimento_de) {
    sql += ' AND m.vencimento >= ?';
    params.push(filtros.vencimento_de);
  }
  if (filtros.vencimento_ate) {
    sql += ' AND m.vencimento <= ?';
    params.push(filtros.vencimento_ate);
  }

  sql += ' ORDER BY DATE(m.vencimento) DESC, m.id DESC';
  return runQuery(sql, params);
}

async function listarMensalidadesPorAluno(alunoId, filtros = {}, scope = null) {
  const id = Number(alunoId);
  if (!id) throw new AppError('ID de aluno invalido', 400, 'ALUNO_ID_INVALIDO');

  const pagina = Math.max(1, parseInt(filtros.pagina || '1'));
  const limite = Math.min(100, Math.max(1, parseInt(filtros.limite || '10')));
  const offset = (pagina - 1) * limite;
  const params = [id];
  let where = 'WHERE m.aluno_id = ? AND m.deleted_at IS NULL';

  if (scope?.tenant_id && scope?.unit_id) {
    where += ' AND m.tenant_id = ? AND m.unit_id = ?';
    params.push(scope.tenant_id, scope.unit_id);
  }

  if (filtros.status) {
    where += ' AND m.status = ?';
    params.push(filtros.status);
  }

  const totalRow = await runGet(`SELECT COUNT(*) AS total FROM mensalidade m ${where}`, params);
  const mensalidades = await runQuery(
    `SELECT m.*, p.nome AS plano_nome
     FROM mensalidade m
     LEFT JOIN plano p ON p.id = m.plano_id
     ${where}
     ORDER BY DATE(m.vencimento) DESC, m.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limite, offset]
  );

  return {
    mensalidades,
    total: totalRow?.total || 0,
    pagina,
    limite,
  };
}

async function listarAlunosComMensalidades(scope = null) {
  const alunos = scope?.tenant_id && scope?.unit_id
    ? await runQuery('SELECT * FROM aluno WHERE tenant_id = ? AND unit_id = ? ORDER BY nome ASC', [scope.tenant_id, scope.unit_id])
    : await runQuery('SELECT * FROM aluno ORDER BY nome ASC');
  for (const aluno of alunos) {
    const params = [aluno.id];
    let sql = 'SELECT * FROM mensalidade WHERE aluno_id = ? AND deleted_at IS NULL';
    if (scope?.tenant_id && scope?.unit_id) {
      sql += ' AND tenant_id = ? AND unit_id = ?';
      params.push(scope.tenant_id, scope.unit_id);
    }
    sql += ' ORDER BY DATE(vencimento) DESC, id DESC';
    aluno.mensalidades = await runQuery(sql, params);
  }
  return alunos;
}

async function atualizarMensalidade(id, payload = {}, scope = null) {
  const mensalidadeId = Number(id);
  if (!mensalidadeId) throw new AppError('ID invalido', 400, 'MENSALIDADE_ID_INVALIDO');

  const atual = scope?.tenant_id && scope?.unit_id
    ? await runGet('SELECT * FROM mensalidade WHERE id = ? AND tenant_id = ? AND unit_id = ?', [mensalidadeId, scope.tenant_id, scope.unit_id])
    : await runGet('SELECT * FROM mensalidade WHERE id = ?', [mensalidadeId]);
  if (!atual || atual.deleted_at) throw new AppError('Mensalidade nao encontrada', 404, 'MENSALIDADE_NAO_ENCONTRADA');

  const valor = toMoney(payload.valor_cobrado ?? atual.valor_cobrado);
  const desconto = toMoney(payload.desconto_aplicado ?? atual.desconto_aplicado) ?? 0;
  const venc = isISODate(payload.vencimento || atual.vencimento)
    ? (payload.vencimento || atual.vencimento)
    : atual.vencimento;
  const statusNormalizado = payload.status ? validarStatusMensalidade(payload.status) : atual.status;

  const plano = scope?.tenant_id
    ? await runGet('SELECT * FROM plano WHERE id = ? AND tenant_id = ?', [atual.plano_id, scope.tenant_id])
    : await runGet('SELECT * FROM plano WHERE id = ?', [atual.plano_id]);
  const inicioCiclo = startOfCycle(venc);
  const dataFim = addDays(inicioCiclo, Math.max(0, Number(plano?.duracao_em_dias || 30) - 1));
  await FechamentoMensalService.assertPeriodoEditavelPorData(venc, 'edicao de mensalidade', null, scope);

  await runExecute(
    `UPDATE mensalidade
     SET valor_cobrado = ?, desconto_aplicado = ?, data_inicio = ?, data_fim = ?, vencimento = ?, observacoes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [valor, desconto, inicioCiclo, dataFim, venc, payload.observacoes || '', statusNormalizado, mensalidadeId]
  );

  return runGet('SELECT * FROM mensalidade WHERE id = ?', [mensalidadeId]);
}

async function removerMensalidade(id, actor, motivo = null, scope = null) {
  const mensalidadeId = Number(id);
  if (!mensalidadeId) throw new AppError('ID invalido', 400, 'MENSALIDADE_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const before = scope?.tenant_id && scope?.unit_id
      ? await tx.get('SELECT * FROM mensalidade WHERE id = ? AND tenant_id = ? AND unit_id = ?', [mensalidadeId, scope.tenant_id, scope.unit_id])
      : await tx.get('SELECT * FROM mensalidade WHERE id = ?', [mensalidadeId]);
    if (!before || before.deleted_at) {
      throw new AppError('Mensalidade nao encontrada para deletar', 404, 'MENSALIDADE_NAO_ENCONTRADA');
    }

    await FechamentoMensalService.assertPeriodoEditavelPorData(before.vencimento || before.updated_at, 'remocao logica de mensalidade', tx, scope);
    await tx.run(
      'UPDATE mensalidade SET deleted_at = datetime(\'now\'), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [mensalidadeId]
    );

    const after = await tx.get('SELECT * FROM mensalidade WHERE id = ?', [mensalidadeId]);
    await AuditService.logAction({
      actor,
      action: 'remover_mensalidade_logicamente',
      module: 'mensalidades',
      recordType: 'mensalidade',
      recordId: mensalidadeId,
      before,
      after,
      metadata: { motivo: motivo || 'Remocao logica solicitada pela API' },
      tenant_id: scope?.tenant_id,
      unit_id: scope?.unit_id,
    }, tx);

    return after;
  });
}

async function listarVigentes(scope = null) {
  const params = [MENSALIDADE_STATUS.PAGO];
  let scoped = '';
  if (scope?.tenant_id && scope?.unit_id) {
    scoped = 'AND tenant_id = ? AND unit_id = ?';
    params.push(scope.tenant_id, scope.unit_id);
  }
  return runQuery(`
    SELECT * FROM mensalidade
    WHERE status = ?
      AND deleted_at IS NULL
      AND vencimento IS NOT NULL
      AND vencimento != '0000-00-00'
      ${scoped}
      AND DATE(data_inicio) <= DATE('now')
      AND DATE(data_fim) >= DATE('now')
    ORDER BY DATE(vencimento) DESC
  `, params);
}

async function registrarPagamento(payload = {}, actor, scope = null) {
  const { mensalidade_id, data_pagamento, valor_pago } = payload;
  const dataPagamentoFinal = data_pagamento || new Date().toISOString().slice(0, 10);

  if (!mensalidade_id || valor_pago === undefined || valor_pago === null || valor_pago === '') {
    throw new AppError('Campos obrigatorios faltando', 400, 'PAGAMENTO_PAYLOAD_INVALIDO');
  }

  return runTransaction(async (tx) => {
    await FechamentoMensalService.assertPeriodoEditavelPorData(dataPagamentoFinal, 'pagamento de mensalidade', tx, scope);

    const mensalidade = scope?.tenant_id && scope?.unit_id
      ? await tx.get('SELECT * FROM mensalidade WHERE id = ? AND tenant_id = ? AND unit_id = ?', [mensalidade_id, scope.tenant_id, scope.unit_id])
      : await tx.get('SELECT * FROM mensalidade WHERE id = ?', [mensalidade_id]);
    if (!mensalidade || mensalidade.deleted_at) throw new AppError('Mensalidade nao encontrada', 404, 'MENSALIDADE_NAO_ENCONTRADA');

    if (mensalidade.status === MENSALIDADE_STATUS.CANCELADO) {
      throw new AppError('Mensalidade cancelada nao pode ser paga', 400, 'MENSALIDADE_CANCELADA');
    }

    const valor = Number(valor_pago);
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new AppError('valor_pago invalido', 400, 'VALOR_PAGO_INVALIDO');
    }

    const valorPrevisto = Number(mensalidade.valor_cobrado || 0);
    const novoStatus = valor < valorPrevisto ? MENSALIDADE_STATUS.PARCIAL : MENSALIDADE_STATUS.PAGO;
    const pagamentoAntes = await tx.get('SELECT * FROM pagamento WHERE mensalidade_id = ?', [mensalidade_id]);
    let pagamentoId;

    // O registro de pagamento precisa permanecer idempotente no dominio:
    // atualiza ou cria o pagamento, reflete o status da mensalidade, faz
    // upsert do lancamento financeiro e audita tudo no mesmo contexto.
    if (pagamentoAntes) {
      await tx.run(
        'UPDATE pagamento SET data_pagamento = ?, valor_pago = ?, valor_previsto = ?, tenant_id = COALESCE(tenant_id, ?), unit_id = COALESCE(unit_id, ?) WHERE id = ?',
        [dataPagamentoFinal, valor, valorPrevisto, scope?.tenant_id || mensalidade.tenant_id || null, scope?.unit_id || mensalidade.unit_id || null, pagamentoAntes.id]
      );
      pagamentoId = pagamentoAntes.id;
    } else {
      const result = await tx.run(
        'INSERT INTO pagamento (mensalidade_id, data_pagamento, valor_pago, valor_previsto, tenant_id, unit_id) VALUES (?, ?, ?, ?, ?, ?)',
        [mensalidade_id, dataPagamentoFinal, valor, valorPrevisto, scope?.tenant_id || mensalidade.tenant_id || null, scope?.unit_id || mensalidade.unit_id || null]
      );
      pagamentoId = result.lastID;
    }

    await tx.run(
      'UPDATE mensalidade SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [novoStatus, mensalidade_id]
    );

    await FinanceiroService.upsertLancamentoFinanceiro({
      descricao: `Mensalidade ${mensalidade_id}`,
      tipo: 'receita',
      valor,
      data_lancamento: dataPagamentoFinal,
      status: 'pago',
      plano_contas_id: 1,
      origem: 'mensalidade',
      origem_id: mensalidade_id,
      tenant_id: scope?.tenant_id || mensalidade.tenant_id || null,
      unit_id: scope?.unit_id || mensalidade.unit_id || null,
    }, tx);

    const pagamentoDepois = await tx.get('SELECT * FROM pagamento WHERE id = ?', [pagamentoId]);
    const mensalidadeDepois = await tx.get('SELECT * FROM mensalidade WHERE id = ?', [mensalidade_id]);

    await AuditService.logAction({
      actor,
      action: 'registrar_pagamento_mensalidade',
      module: 'mensalidades',
      recordType: 'mensalidade',
      recordId: mensalidade_id,
      before: { mensalidade, pagamento: pagamentoAntes || null },
      after: { mensalidade: mensalidadeDepois, pagamento: pagamentoDepois },
      tenant_id: scope?.tenant_id || mensalidade.tenant_id || null,
      unit_id: scope?.unit_id || mensalidade.unit_id || null,
    }, tx);

    return {
      id: pagamentoId,
      mensalidade_id,
      data_pagamento: dataPagamentoFinal,
      valor_pago: valor,
      status_mensalidade: novoStatus,
    };
  });
}

module.exports = {
  criarMensalidade,
  listarMensalidades,
  listarMensalidadesPorAluno,
  listarAlunosComMensalidades,
  atualizarMensalidade,
  removerMensalidade,
  listarVigentes,
  registrarPagamento,
};
