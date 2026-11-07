const { runGet, runExecute, runQuery, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const { MENSALIDADE_STATUS, MENSALIDADE_STATUS_VALUES } = require('../constants/domainStates');
const AuditService = require('./AuditService');
const FechamentoMensalService = require('./FechamentoMensalService');
const FinanceiroService = require('./FinanceiroService');
const crypto = require('crypto');
const { paraCentavos, deCentavos } = require('../utils/dinheiro');
const { dataLocalISO } = require('../utils/dataLocal');

function clientOrDefault(client) {
  return client || { get: runGet, all: runQuery, run: runExecute };
}

function isISODate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
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

async function validarAlunoCobravel(alunoId, scope = null, client = null) {
  const db = clientOrDefault(client);
  const vinculo = scope?.tenant_id && scope?.unit_id
    ? await db.get('SELECT responsavel_id FROM plano_associado WHERE aluno_id = ? AND tenant_id = ? AND unit_id = ? LIMIT 1', [alunoId, scope.tenant_id, scope.unit_id])
    : await db.get('SELECT responsavel_id FROM plano_associado WHERE aluno_id = ? LIMIT 1', [alunoId]);
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

function isMensalidadeComEfeitoPago(status) {
  return [MENSALIDADE_STATUS.PAGO, MENSALIDADE_STATUS.PARCIAL].includes(String(status || '').toLowerCase());
}

function isLancamentoPago(lancamento) {
  return String(lancamento?.status || '').toLowerCase() === 'pago';
}

async function listarLancamentosDerivadosAtivos(tx, mensalidade, scope = null) {
  const tenantId = scope?.tenant_id || mensalidade.tenant_id || null;
  const unitId = scope?.unit_id || mensalidade.unit_id || null;
  const scoped = tenantId && unitId;
  const params = ['mensalidade', mensalidade.id];

  let sql = `
    SELECT *
    FROM conta_financeira
    WHERE origem = ?
      AND origem_id = ?
      AND deleted_at IS NULL`;

  if (scoped) {
    sql += ' AND tenant_id = ? AND unit_id = ?';
    params.push(tenantId, unitId);
  }

  sql += ' ORDER BY id ASC';
  return tx.all(sql, params);
}

async function neutralizarLancamentosDerivadosCancelaveis(tx, mensalidade, scope = null) {
  const lancamentos = await listarLancamentosDerivadosAtivos(tx, mensalidade, scope);

  if (isMensalidadeComEfeitoPago(mensalidade.status) || lancamentos.some(isLancamentoPago)) {
    throw new AppError(
      'Mensalidade com efeito financeiro pago deve ser revertida pelo fluxo de reversão controlada.',
      409,
      'MENSALIDADE_REQUER_REVERSAO_CONTROLADA'
    );
  }

  for (const lancamento of lancamentos) {
    await FechamentoMensalService.assertPeriodoEditavelPorData(
      lancamento.data_lancamento || mensalidade.vencimento || mensalidade.updated_at,
      'neutralizacao de lancamento financeiro derivado de mensalidade',
      tx,
      scope
    );

    await tx.run(
      'UPDATE conta_financeira SET deleted_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?',
      [lancamento.id]
    );
  }
}

async function criarMensalidade(payload = {}, scope = null, client = null) {
  const db = clientOrDefault(client);
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
    ? await db.get('SELECT * FROM aluno WHERE id = ? AND tenant_id = ? AND unit_id = ?', [aluno_id, scope.tenant_id, scope.unit_id])
    : await db.get('SELECT * FROM aluno WHERE id = ?', [aluno_id]);
  if (!aluno) throw new AppError('Aluno nao encontrado', 404, 'ALUNO_NAO_ENCONTRADO');

  await validarAlunoCobravel(aluno_id, scope, db);

  const planoIdFinal = Number(plano_id || aluno.plano_id);
  if (!planoIdFinal) throw new AppError('plano_id e obrigatorio', 400, 'PLANO_ID_OBRIGATORIO');

  const plano = scope?.tenant_id
    ? await db.get('SELECT * FROM plano WHERE id = ? AND tenant_id = ?', [planoIdFinal, scope.tenant_id])
    : await db.get('SELECT * FROM plano WHERE id = ?', [planoIdFinal]);
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
  const valorReferenciaDesconto = toMoney(payload.valor_referencia_desconto ?? valorBase);
  if (valorReferenciaDesconto === null || valorReferenciaDesconto <= 0) {
    throw new AppError('valor_referencia_desconto invalido', 400, 'VALOR_REFERENCIA_DESCONTO_INVALIDO');
  }
  if (desconto >= valorReferenciaDesconto) {
    throw new AppError(
      'desconto_aplicado nao pode ser maior ou igual ao valor de referencia',
      400,
      'DESCONTO_MAIOR_QUE_VALOR'
    );
  }

  const statusNormalizado = validarStatusMensalidade(status);
  await FechamentoMensalService.assertPeriodoEditavelPorData(venc, 'criacao de mensalidade', db, scope);
  const duplicada = await db.get(
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

  const result = await db.run(
    `INSERT INTO mensalidade
      (aluno_id, plano_id, valor_cobrado, desconto_aplicado, status, data_inicio, data_fim, vencimento, observacoes, tenant_id, unit_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [aluno_id, planoIdFinal, valorBase, desconto, statusNormalizado, inicioCiclo, dataFim, venc, observacoes || '', scope?.tenant_id || aluno.tenant_id || null, scope?.unit_id || aluno.unit_id || null]
  );

  return db.get('SELECT * FROM mensalidade WHERE id = ?', [result.lastID]);
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
    `SELECT m.*, p.nome AS plano_nome,
            (SELECT COALESCE(SUM(pg.valor_pago), 0) FROM pagamento pg
              WHERE pg.mensalidade_id = m.id AND pg.estornado_em IS NULL) AS total_pago,
            MAX(COALESCE(m.valor_cobrado, 0) - (SELECT COALESCE(SUM(pg.valor_pago), 0) FROM pagamento pg
              WHERE pg.mensalidade_id = m.id AND pg.estornado_em IS NULL), 0) AS saldo_em_aberto
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

  // P10: a edicao so muda cobertura e observacoes quando esses campos vem no
  // payload. Antes, toda edicao recalculava a cobertura pela regra de 30 dias
  // (desfazendo pacotes e contratacoes) e apagava observacoes nao enviadas.
  const pedeInicio = hasOwn(payload, 'data_inicio');
  const pedeFim = hasOwn(payload, 'data_fim');
  let inicioCiclo = atual.data_inicio;
  let dataFim = atual.data_fim;
  if (pedeInicio || pedeFim) {
    inicioCiclo = pedeInicio ? payload.data_inicio : atual.data_inicio;
    dataFim = pedeFim ? payload.data_fim : atual.data_fim;
    if (!isISODate(inicioCiclo) || !isISODate(dataFim) || inicioCiclo > dataFim) {
      throw new AppError(
        'data_inicio e data_fim devem ser datas AAAA-MM-DD com data_inicio <= data_fim',
        400,
        'MENSALIDADE_COBERTURA_INVALIDA'
      );
    }
  }
  const observacoes = hasOwn(payload, 'observacoes') ? (payload.observacoes ?? '') : atual.observacoes;

  return runTransaction(async (tx) => {
    await FechamentoMensalService.assertPeriodoEditavelPorData(venc, 'edicao de mensalidade', tx, scope);

    if (payload.status && statusNormalizado === MENSALIDADE_STATUS.CANCELADO) {
      await neutralizarLancamentosDerivadosCancelaveis(tx, atual, scope);
    }

    await tx.run(
      `UPDATE mensalidade
       SET valor_cobrado = ?, desconto_aplicado = ?, data_inicio = ?, data_fim = ?, vencimento = ?, observacoes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [valor, desconto, inicioCiclo, dataFim, venc, observacoes, statusNormalizado, mensalidadeId]
    );

    return tx.get('SELECT * FROM mensalidade WHERE id = ?', [mensalidadeId]);
  });
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
    await neutralizarLancamentosDerivadosCancelaveis(tx, before, scope);

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

function normalizarChaveIdempotencia(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const chave = String(valor).trim();
  if (!chave || chave.length > 128 || !/^[A-Za-z0-9._:\-]+$/.test(chave)) {
    throw new AppError(
      'Chave de idempotencia invalida (1 a 128 caracteres: letras, numeros, ponto, dois-pontos, hifen ou sublinhado)',
      400,
      'IDEMPOTENCIA_CHAVE_INVALIDA'
    );
  }
  return chave;
}

// Hash dos dados enviados (nao dos defaults calculados no servidor), para que
// o reenvio da mesma requisicao em outro dia continue sendo reconhecido.
function hashRequisicaoPagamento({ mensalidade_id, valorCentavos, data_pagamento, forma_pagamento }) {
  const canonico = JSON.stringify({
    mensalidade_id: Number(mensalidade_id),
    valor_centavos: valorCentavos,
    data_pagamento: data_pagamento || null,
    forma_pagamento: forma_pagamento || null,
  });
  return crypto.createHash('sha256').update(canonico).digest('hex');
}

// Status pela soma dos pagamentos validos (nao estornados), em centavos.
function statusPorSaldo(valorCobradoCentavos, pagoCentavos, statusAtual) {
  if (pagoCentavos > 0 && pagoCentavos >= valorCobradoCentavos) return MENSALIDADE_STATUS.PAGO;
  if (pagoCentavos > 0) return MENSALIDADE_STATUS.PARCIAL;
  return statusAtual === MENSALIDADE_STATUS.VENCIDO ? MENSALIDADE_STATUS.VENCIDO : MENSALIDADE_STATUS.EM_ABERTO;
}

async function resumoSaldoMensalidade(tx, mensalidade) {
  const rows = await tx.all(
    `SELECT valor_pago FROM pagamento
     WHERE mensalidade_id = ? AND estornado_em IS NULL
       AND (tenant_id = ? OR tenant_id IS NULL) AND (unit_id = ? OR unit_id IS NULL)`,
    [mensalidade.id, mensalidade.tenant_id, mensalidade.unit_id]
  );
  const pagoCentavos = rows.reduce((acc, r) => acc + (paraCentavos(r.valor_pago) ?? Math.round(Number(r.valor_pago || 0) * 100)), 0);
  const valorCobradoCentavos = paraCentavos(mensalidade.valor_cobrado || 0) ?? Math.round(Number(mensalidade.valor_cobrado || 0) * 100);
  const saldoCentavos = Math.max(valorCobradoCentavos - pagoCentavos, 0);
  return {
    valorCobradoCentavos,
    pagoCentavos,
    saldoCentavos,
    pagamentos_validos: rows.length,
    valor_cobrado: deCentavos(valorCobradoCentavos),
    total_pago: deCentavos(pagoCentavos),
    saldo_em_aberto: deCentavos(saldoCentavos),
  };
}

const STATUS_QUE_NAO_RECEBEM = new Set([
  MENSALIDADE_STATUS.CANCELADO,
  MENSALIDADE_STATUS.EM_REVERSAO_CONTROLADA,
]);

// GS-07 P1 (D6): cada pagamento e um registro proprio; a mensalidade so fica
// paga quando a soma dos pagamentos validos alcanca o valor cobrado.
// Tudo roda na transacao recebida (BEGIN IMMEDIATE em registrarPagamento), de
// modo que a leitura do saldo e a gravacao nao intercalam com outra escrita.
async function registrarPagamentoNoContexto(payload = {}, actor, scope = null, tx) {
  const { mensalidade_id, data_pagamento, valor_pago, forma_pagamento } = payload;

  if (!mensalidade_id || valor_pago === undefined || valor_pago === null || valor_pago === '') {
    throw new AppError('Campos obrigatorios faltando', 400, 'PAGAMENTO_PAYLOAD_INVALIDO');
  }
  if (data_pagamento !== undefined && data_pagamento !== null && data_pagamento !== '' && !isISODate(data_pagamento)) {
    throw new AppError('data_pagamento deve estar no formato YYYY-MM-DD', 400, 'DATA_PAGAMENTO_INVALIDA');
  }

  const valorCentavos = paraCentavos(valor_pago);
  if (valorCentavos === null || valorCentavos <= 0) {
    throw new AppError('valor_pago invalido (use valor positivo com ate duas casas decimais)', 400, 'VALOR_PAGO_INVALIDO');
  }

  const chave = normalizarChaveIdempotencia(payload.chave_idempotencia);
  const hash = chave
    ? hashRequisicaoPagamento({ mensalidade_id, valorCentavos, data_pagamento, forma_pagamento })
    : null;
  const tenantId = scope?.tenant_id || null;
  const unitId = scope?.unit_id || null;

  if (chave) {
    const anterior = await tx.get(
      `SELECT * FROM pagamento
       WHERE chave_idempotencia = ? AND tenant_id IS ? AND unit_id IS ?`,
      [chave, tenantId, unitId]
    );
    if (anterior) {
      if (anterior.idempotencia_hash !== hash) {
        throw new AppError(
          'Chave de idempotencia ja usada com dados diferentes',
          409,
          'IDEMPOTENCIA_CONFLITO',
          { pagamento_id: anterior.id }
        );
      }
      // Reenvio identico: devolve o resultado original sem gravar nada,
      // mesmo que a mensalidade ja esteja quitada ou o pagamento estornado.
      let original = null;
      try { original = anterior.resposta_json ? JSON.parse(anterior.resposta_json) : null; } catch (_) { original = null; }
      return {
        ...(original || {
          id: anterior.id,
          mensalidade_id: anterior.mensalidade_id,
          data_pagamento: anterior.data_pagamento,
          valor_pago: Number(anterior.valor_pago),
        }),
        idempotente: true,
      };
    }
  }

  const dataPagamentoFinal = data_pagamento || dataLocalISO();
  await FechamentoMensalService.assertPeriodoEditavelPorData(dataPagamentoFinal, 'pagamento de mensalidade', tx, scope);

  const mensalidade = scope?.tenant_id && scope?.unit_id
    ? await tx.get('SELECT * FROM mensalidade WHERE id = ? AND tenant_id = ? AND unit_id = ?', [mensalidade_id, scope.tenant_id, scope.unit_id])
    : await tx.get('SELECT * FROM mensalidade WHERE id = ?', [mensalidade_id]);
  if (!mensalidade || mensalidade.deleted_at) throw new AppError('Mensalidade nao encontrada', 404, 'MENSALIDADE_NAO_ENCONTRADA');

  if (mensalidade.status === MENSALIDADE_STATUS.CANCELADO) {
    throw new AppError('Mensalidade cancelada nao pode ser paga', 400, 'MENSALIDADE_CANCELADA');
  }
  if (STATUS_QUE_NAO_RECEBEM.has(mensalidade.status) || mensalidade.reversao_controlada_id) {
    throw new AppError('Mensalidade em reversao controlada nao pode receber pagamento', 409, 'MENSALIDADE_EM_REVERSAO');
  }

  const antes = await resumoSaldoMensalidade(tx, mensalidade);
  if (antes.saldoCentavos <= 0) {
    throw new AppError('Mensalidade ja quitada: nao ha saldo em aberto', 409, 'MENSALIDADE_QUITADA', {
      valor_cobrado: antes.valor_cobrado,
      total_pago: antes.total_pago,
      saldo_em_aberto: 0,
    });
  }
  if (valorCentavos > antes.saldoCentavos) {
    throw new AppError(
      `Pagamento acima do saldo em aberto (saldo R$ ${antes.saldo_em_aberto.toFixed(2)})`,
      422,
      'PAGAMENTO_ACIMA_DO_SALDO',
      {
        valor_cobrado: antes.valor_cobrado,
        total_pago: antes.total_pago,
        saldo_em_aberto: antes.saldo_em_aberto,
        valor_informado: deCentavos(valorCentavos),
      }
    );
  }

  const valor = deCentavos(valorCentavos);
  const tenantFinal = tenantId || mensalidade.tenant_id || null;
  const unitFinal = unitId || mensalidade.unit_id || null;
  const insert = await tx.run(
    `INSERT INTO pagamento
      (mensalidade_id, data_pagamento, valor_pago, valor_previsto, tenant_id, unit_id,
       chave_idempotencia, idempotencia_hash, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
    [
      mensalidade.id, dataPagamentoFinal, valor, Number(mensalidade.valor_cobrado || 0), tenantFinal, unitFinal,
      chave, hash, actor?.id || null,
    ]
  );
  const pagamentoId = insert.lastID;

  const lancamentoId = await FinanceiroService.upsertLancamentoFinanceiro({
    descricao: `Pagamento ${pagamentoId} da mensalidade ${mensalidade.id}`,
    tipo: 'receita',
    valor,
    data_lancamento: dataPagamentoFinal,
    status: 'pago',
    plano_contas_id: 1,
    origem: 'pagamento_mensalidade',
    origem_id: pagamentoId,
    tenant_id: tenantFinal,
    unit_id: unitFinal,
  }, tx);
  await tx.run('UPDATE pagamento SET lancamento_id = ? WHERE id = ?', [lancamentoId, pagamentoId]);

  const depois = await resumoSaldoMensalidade(tx, mensalidade);
  const novoStatus = statusPorSaldo(depois.valorCobradoCentavos, depois.pagoCentavos, mensalidade.status);
  await tx.run('UPDATE mensalidade SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [novoStatus, mensalidade.id]);

  const mensalidadeDepois = await tx.get('SELECT * FROM mensalidade WHERE id = ?', [mensalidade.id]);
  await FinanceiroService.reconciliarLancamentoAgregadoMensalidade(mensalidadeDepois, tx, {
    operacao: 'lancamento agregado de mensalidade',
  });

  const resultado = {
    id: pagamentoId,
    mensalidade_id: mensalidade.id,
    data_pagamento: dataPagamentoFinal,
    valor_pago: valor,
    status_mensalidade: novoStatus,
    lancamento_id: lancamentoId,
    valor_cobrado: depois.valor_cobrado,
    total_pago: depois.total_pago,
    saldo_em_aberto: depois.saldo_em_aberto,
  };
  await tx.run('UPDATE pagamento SET resposta_json = ? WHERE id = ?', [JSON.stringify(resultado), pagamentoId]);

  const pagamentoDepois = await tx.get('SELECT * FROM pagamento WHERE id = ?', [pagamentoId]);
  await AuditService.logAction({
    actor,
    action: 'registrar_pagamento_mensalidade',
    module: 'mensalidades',
    recordType: 'mensalidade',
    recordId: mensalidade.id,
    before: { mensalidade, saldo: { total_pago: antes.total_pago, saldo_em_aberto: antes.saldo_em_aberto } },
    after: { mensalidade: mensalidadeDepois, pagamento: pagamentoDepois, saldo: { total_pago: depois.total_pago, saldo_em_aberto: depois.saldo_em_aberto } },
    metadata: { chave_idempotencia: chave, lancamento_id: lancamentoId },
    tenant_id: tenantFinal,
    unit_id: unitFinal,
  }, tx);

  return resultado;
}

async function registrarPagamento(payload = {}, actor, scope = null, client = null) {
  if (client) {
    return registrarPagamentoNoContexto(payload, actor, scope, client);
  }

  return runTransaction((tx) => registrarPagamentoNoContexto(payload, actor, scope, tx));
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
  resumoSaldoMensalidade,
  statusPorSaldo,
};
