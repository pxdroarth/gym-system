const { runQuery, runGet, runExecute, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const { FECHAMENTO_STATUS } = require('../constants/domainStates');

function clientOrDefault(client) {
  return client || { all: runQuery, get: runGet, run: runExecute };
}

function periodoDeData(data) {
  const d = data ? new Date(`${String(data).slice(0, 10)}T12:00:00`) : new Date();
  return {
    ano: d.getFullYear(),
    mes: d.getMonth() + 1,
  };
}

function validarPeriodo(ano, mes) {
  const anoNum = Number(ano);
  const mesNum = Number(mes);
  if (!anoNum || !mesNum || mesNum < 1 || mesNum > 12) {
    throw new AppError('Periodo invalido', 400, 'PERIODO_INVALIDO');
  }
  return { ano: anoNum, mes: mesNum };
}

function intervaloPeriodo(ano, mes) {
  const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
  return { inicio: ini, fim };
}

async function obterFechamento(ano, mes, client = null) {
  const db = clientOrDefault(client);
  return db.get('SELECT * FROM fechamento_mensal WHERE ano = ? AND mes = ?', [ano, mes]);
}

async function assertPeriodoEditavelPorData(data, operacao, client = null) {
  const { ano, mes } = periodoDeData(data);
  const fechamento = await obterFechamento(ano, mes, client);

  if (
    fechamento &&
    [FECHAMENTO_STATUS.FECHADO, FECHAMENTO_STATUS.FECHADO_COM_INCONSISTENCIAS].includes(fechamento.status)
  ) {
    throw new AppError(
      `Periodo ${String(mes).padStart(2, '0')}/${ano} esta fechado para ${operacao}`,
      423,
      'PERIODO_FECHADO',
      { ano, mes, status: fechamento.status, operacao }
    );
  }
}

async function analisarPeriodo(ano, mes, client = null) {
  const { ano: anoNum, mes: mesNum } = validarPeriodo(ano, mes);
  const db = clientOrDefault(client);
  const { inicio, fim } = intervaloPeriodo(anoNum, mesNum);
  const inconsistencias = [];

  const mensalidadesSemLancamento = await db.all(
    `SELECT m.id, m.status, m.aluno_id
     FROM mensalidade m
     LEFT JOIN conta_financeira cf ON cf.origem = 'mensalidade' AND cf.origem_id = m.id
     WHERE m.status IN ('pago', 'parcial')
       AND m.deleted_at IS NULL
       AND DATE(COALESCE(m.updated_at, m.vencimento)) BETWEEN DATE(?) AND DATE(?)
       AND cf.id IS NULL`,
    [inicio, fim]
  );
  for (const item of mensalidadesSemLancamento) {
    inconsistencias.push({
      tipo: 'mensalidade_sem_lancamento_financeiro',
      modulo: 'mensalidades',
      registro_id: item.id,
      detalhe: item,
    });
  }

  const vendasSemEntrada = await db.all(
    `SELECT v.id, v.produto_id, v.valor_total
     FROM venda_produto v
     LEFT JOIN conta_financeira cf ON cf.origem = 'venda_produto' AND cf.origem_id = v.id
     WHERE DATE(v.data_venda) BETWEEN DATE(?) AND DATE(?)
       AND v.deleted_at IS NULL
       AND cf.id IS NULL`,
    [inicio, fim]
  );
  for (const item of vendasSemEntrada) {
    inconsistencias.push({
      tipo: 'venda_sem_entrada_financeira',
      modulo: 'vendas_produtos',
      registro_id: item.id,
      detalhe: item,
    });
  }

  const lancamentosOrfaos = await db.all(
    `SELECT cf.id, cf.origem, cf.origem_id
     FROM conta_financeira cf
     LEFT JOIN mensalidade m ON cf.origem = 'mensalidade' AND cf.origem_id = m.id
     LEFT JOIN venda_produto v ON cf.origem = 'venda_produto' AND cf.origem_id = v.id
     WHERE DATE(cf.data_lancamento) BETWEEN DATE(?) AND DATE(?)
       AND cf.deleted_at IS NULL
       AND cf.origem IN ('mensalidade', 'venda_produto')
       AND (
         (cf.origem = 'mensalidade' AND m.id IS NULL)
         OR (cf.origem = 'venda_produto' AND v.id IS NULL)
       )`,
    [inicio, fim]
  );
  for (const item of lancamentosOrfaos) {
    inconsistencias.push({
      tipo: 'lancamento_financeiro_orfao',
      modulo: 'financeiro',
      registro_id: item.id,
      detalhe: item,
    });
  }

  const vendasProdutoOrfao = await db.all(
    `SELECT v.id, v.produto_id
     FROM venda_produto v
     LEFT JOIN produto p ON p.id = v.produto_id
     WHERE DATE(v.data_venda) BETWEEN DATE(?) AND DATE(?)
       AND v.deleted_at IS NULL
       AND v.produto_id IS NOT NULL
       AND p.id IS NULL`,
    [inicio, fim]
  );
  for (const item of vendasProdutoOrfao) {
    inconsistencias.push({
      tipo: 'venda_com_produto_orfao',
      modulo: 'vendas_produtos',
      registro_id: item.id,
      detalhe: item,
    });
  }

  return {
    ano: anoNum,
    mes: mesNum,
    inicio,
    fim,
    inconsistencias,
  };
}

async function fecharPeriodo(ano, mes, actor) {
  return runTransaction(async (tx) => {
    const periodo = validarPeriodo(ano, mes);
    const before = await obterFechamento(periodo.ano, periodo.mes, tx);
    const analise = await analisarPeriodo(periodo.ano, periodo.mes, tx);
    const status = analise.inconsistencias.length
      ? FECHAMENTO_STATUS.FECHADO_COM_INCONSISTENCIAS
      : FECHAMENTO_STATUS.FECHADO;
    const inconsistenciasJson = JSON.stringify(analise.inconsistencias);

    if (before) {
      await tx.run(
        `UPDATE fechamento_mensal
         SET status = ?, inconsistencias_json = ?, fechado_em = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [status, inconsistenciasJson, before.id]
      );
    } else {
      await tx.run(
        `INSERT INTO fechamento_mensal
          (ano, mes, status, inconsistencias_json, fechado_em, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`,
        [periodo.ano, periodo.mes, status, inconsistenciasJson]
      );
    }

    const after = await obterFechamento(periodo.ano, periodo.mes, tx);
    await AuditService.logAction({
      actor,
      action: 'fechar_periodo',
      module: 'fechamento_mensal',
      recordType: 'fechamento_mensal',
      recordId: after.id,
      before,
      after,
      metadata: { inconsistencias_total: analise.inconsistencias.length },
    }, tx);

    return { fechamento: after, analise };
  });
}

async function reabrirPeriodo(ano, mes, actor) {
  return runTransaction(async (tx) => {
    const periodo = validarPeriodo(ano, mes);
    const before = await obterFechamento(periodo.ano, periodo.mes, tx);
    if (!before) throw new AppError('Fechamento nao encontrado', 404, 'FECHAMENTO_NAO_ENCONTRADO');

    await tx.run(
      `UPDATE fechamento_mensal
       SET status = ?, reaberto_em = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      [FECHAMENTO_STATUS.REABERTO, before.id]
    );

    const after = await obterFechamento(periodo.ano, periodo.mes, tx);
    await AuditService.logAction({
      actor,
      action: 'reabrir_periodo',
      module: 'fechamento_mensal',
      recordType: 'fechamento_mensal',
      recordId: after.id,
      before,
      after,
    }, tx);

    return after;
  });
}

module.exports = {
  periodoDeData,
  assertPeriodoEditavelPorData,
  analisarPeriodo,
  fecharPeriodo,
  reabrirPeriodo,
};
