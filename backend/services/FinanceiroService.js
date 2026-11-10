const { runQuery, runGet, runExecute } = require('../dbHelper');
const AppError = require('../errors/AppError');
const FechamentoMensalService = require('./FechamentoMensalService');

function clientOrDefault(client) {
  return client || { all: runQuery, get: runGet, run: runExecute };
}

function normalizeScope(scope) {
  const tenantId = Number(scope?.tenant_id);
  const unitId = Number(scope?.unit_id);

  if (!tenantId || !unitId) {
    throw new AppError('Escopo de tenant/unidade obrigatorio para sincronizar financeiro', 403, 'FINANCEIRO_SYNC_SCOPE_REQUIRED');
  }

  return { tenant_id: tenantId, unit_id: unitId };
}

function createSyncSummary() {
  return {
    mensalidadesProcessadas: 0,
    vendasProcessadas: 0,
    lancamentosCriadosOuAtualizados: 0,
    ignoradosPorFechamento: 0,
    ignoradosPorEscopo: 0,
  };
}

function isPeriodoFechadoError(error) {
  return error?.code === 'PERIODO_FECHADO' || error?.statusCode === 423;
}

async function isPeriodoEditavel(data, operacao, db, scope) {
  try {
    await FechamentoMensalService.assertPeriodoEditavelPorData(data, operacao, db, scope);
    return true;
  } catch (error) {
    if (isPeriodoFechadoError(error)) return false;
    throw error;
  }
}

// Categoria (plano de contas) so vale se for da mesma Rede do lancamento.
// Sem categoria valida da Rede, o lancamento fica sem categoria (null); valor
// e origem nao mudam. Usada nos lancamentos automaticos e nas contrapartidas.
async function categoriaDaRede(planoContasId, tenantId, client = null) {
  const id = Number(planoContasId);
  if (!id || !tenantId) return null;
  const db = clientOrDefault(client);
  const row = await db.get('SELECT id FROM plano_contas WHERE id = ? AND tenant_id = ?', [id, tenantId]);
  return row ? row.id : null;
}

async function upsertLancamentoFinanceiro(lancamento, client = null) {
  const db = clientOrDefault(client);
  lancamento = {
    ...lancamento,
    plano_contas_id: await categoriaDaRede(lancamento.plano_contas_id, lancamento.tenant_id, db),
  };
  const hasScope = Boolean(lancamento.tenant_id && lancamento.unit_id);
  const existente = hasScope
    ? await db.get(
      'SELECT id FROM conta_financeira WHERE origem = ? AND origem_id = ? AND tenant_id = ? AND unit_id = ? AND deleted_at IS NULL',
      [lancamento.origem, lancamento.origem_id, lancamento.tenant_id, lancamento.unit_id]
    )
    : await db.get(
      'SELECT id FROM conta_financeira WHERE origem = ? AND origem_id = ? AND deleted_at IS NULL',
      [lancamento.origem, lancamento.origem_id]
    );

  if (existente) {
    await db.run(
      `UPDATE conta_financeira
       SET descricao = ?, tipo = ?, valor = ?, data_lancamento = ?, status = ?, plano_contas_id = ?,
           tenant_id = COALESCE(tenant_id, ?), unit_id = COALESCE(unit_id, ?), updated_at = datetime('now')
       WHERE id = ?`,
      [
        lancamento.descricao,
        lancamento.tipo,
        lancamento.valor,
        lancamento.data_lancamento,
        lancamento.status,
        lancamento.plano_contas_id,
        lancamento.tenant_id || null,
        lancamento.unit_id || null,
        existente.id,
      ]
    );
    return existente.id;
  }

  const result = await db.run(
    `INSERT INTO conta_financeira
      (descricao, tipo, valor, data_lancamento, status, plano_contas_id, origem, origem_id, tenant_id, unit_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      lancamento.descricao,
      lancamento.tipo,
      lancamento.valor,
      lancamento.data_lancamento,
      lancamento.status,
      lancamento.plano_contas_id,
      lancamento.origem,
      lancamento.origem_id,
      lancamento.tenant_id || null,
      lancamento.unit_id || null,
    ]
  );
  return result.lastID;
}

// GS-07 P1: cada pagamento novo gera o proprio lancamento (origem
// 'pagamento_mensalidade', origem_id = pagamento.id) na data do pagamento.
// O lancamento agregado (origem 'mensalidade') continua existindo para
// mensalidades legadas e como valor a receber de mensalidades sem pagamento.
// Esta funcao decide o que fazer com o agregado sem duplicar receita:
// - sem pagamento com lancamento proprio: regra legada inalterada;
// - com pagamentos novos e legados: agregado = soma bruta dos legados;
// - so pagamentos novos: um agregado pendente (a receber) e baixado.
// Estornos nunca alteram estes valores: a contrapartida e o lancamento
// inverso da reversao controlada.
async function reconciliarLancamentoAgregadoMensalidade(m, client = null, { operacao = 'lancamento agregado de mensalidade' } = {}) {
  const db = clientOrDefault(client);
  const scopeArgs = [m.id, m.tenant_id, m.unit_id];
  const proprios = await db.get(
    `SELECT COUNT(*) AS total FROM pagamento
     WHERE mensalidade_id = ? AND tenant_id = ? AND unit_id = ? AND lancamento_id IS NOT NULL`,
    scopeArgs
  );
  const legado = await db.get(
    `SELECT COUNT(*) AS total, COALESCE(SUM(valor_pago), 0) AS soma, MAX(valor_pago) AS maior,
            MAX(data_pagamento) AS data_pagamento
     FROM pagamento
     WHERE mensalidade_id = ? AND tenant_id = ? AND unit_id = ? AND lancamento_id IS NULL`,
    scopeArgs
  );
  const resolvedScope = { tenant_id: m.tenant_id, unit_id: m.unit_id };
  const base = {
    descricao: `Mensalidade ${m.id}`,
    tipo: 'receita',
    plano_contas_id: 1,
    origem: 'mensalidade',
    origem_id: m.id,
    tenant_id: m.tenant_id,
    unit_id: m.unit_id,
  };

  if (!Number(proprios?.total)) {
    const pago = m.status === 'pago' || m.status === 'parcial';
    const dataLancamento = pago
      ? (legado?.data_pagamento || (m.updated_at ? String(m.updated_at).slice(0, 10) : null) || m.vencimento)
      : m.vencimento;
    if (!(await isPeriodoEditavel(dataLancamento, operacao, db, resolvedScope))) return 'ignorado_por_fechamento';
    await upsertLancamentoFinanceiro({
      ...base,
      valor: Number(pago ? (legado?.maior || m.valor_cobrado || 0) : (m.valor_cobrado || 0)),
      data_lancamento: dataLancamento,
      status: pago ? 'pago' : 'pendente',
    }, db);
    return 'agregado_legado';
  }

  if (Number(legado?.total)) {
    if (!(await isPeriodoEditavel(legado.data_pagamento, operacao, db, resolvedScope))) return 'ignorado_por_fechamento';
    await upsertLancamentoFinanceiro({
      ...base,
      valor: Number(legado.soma || 0),
      data_lancamento: legado.data_pagamento,
      status: 'pago',
    }, db);
    return 'agregado_legado_misto';
  }

  const agregado = await db.get(
    `SELECT * FROM conta_financeira
     WHERE origem = 'mensalidade' AND origem_id = ? AND tenant_id = ? AND unit_id = ? AND deleted_at IS NULL`,
    scopeArgs
  );
  if (!agregado || agregado.status === 'pago') return 'sem_alteracao';
  if (!(await isPeriodoEditavel(agregado.data_lancamento, operacao, db, resolvedScope))) return 'ignorado_por_fechamento';
  await db.run(
    "UPDATE conta_financeira SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [agregado.id]
  );
  return 'a_receber_baixado';
}

async function sincronizarLancamentosMensalidades(scope, client = null, summary = createSyncSummary()) {
  const db = clientOrDefault(client);
  const resolvedScope = normalizeScope(scope);
  const mensalidades = await db.all(`
    SELECT m.*,
           (
             SELECT MAX(p.data_pagamento)
             FROM pagamento p
             WHERE p.mensalidade_id = m.id
               AND p.tenant_id = m.tenant_id
               AND p.unit_id = m.unit_id
           ) AS data_pagamento,
           (
             SELECT MAX(p.valor_pago)
             FROM pagamento p
             WHERE p.mensalidade_id = m.id
               AND p.tenant_id = m.tenant_id
               AND p.unit_id = m.unit_id
           ) AS valor_pago
    FROM mensalidade m
    WHERE m.vencimento IS NOT NULL
      AND m.vencimento != '0000-00-00'
      AND m.deleted_at IS NULL
      AND COALESCE(m.status, '') != 'cancelado'
      AND COALESCE(m.status, '') != 'em_reversao_controlada'
      AND m.tenant_id = ?
      AND m.unit_id = ?
  `, [resolvedScope.tenant_id, resolvedScope.unit_id]);

  for (const m of mensalidades) {
    summary.mensalidadesProcessadas += 1;
    const resultado = await reconciliarLancamentoAgregadoMensalidade(m, db, {
      operacao: 'sincronizacao financeira de mensalidade',
    });
    if (resultado === 'ignorado_por_fechamento') summary.ignoradosPorFechamento += 1;
    else if (resultado !== 'sem_alteracao') summary.lancamentosCriadosOuAtualizados += 1;
  }

  return summary;
}

async function sincronizarLancamentosVendas(scope, client = null, summary = createSyncSummary()) {
  const db = clientOrDefault(client);
  const resolvedScope = normalizeScope(scope);
  const vendas = await db.all(
    'SELECT * FROM venda_produto WHERE deleted_at IS NULL AND tenant_id = ? AND unit_id = ?',
    [resolvedScope.tenant_id, resolvedScope.unit_id]
  );
  for (const v of vendas) {
    summary.vendasProcessadas += 1;
    const dataLancamento = v.data_venda || new Date().toISOString().slice(0, 10);
    const canSync = await isPeriodoEditavel(
      dataLancamento,
      'sincronizacao financeira de venda',
      db,
      resolvedScope
    );
    if (!canSync) {
      summary.ignoradosPorFechamento += 1;
      continue;
    }

    await upsertLancamentoFinanceiro({
      descricao: `Venda ${v.id}`,
      tipo: 'receita',
      valor: Number(v.valor_total || (Number(v.quantidade || 0) * Number(v.preco_unitario || 0))),
      data_lancamento: dataLancamento,
      status: 'pago',
      plano_contas_id: 2,
      origem: 'venda_produto',
      origem_id: v.id,
      tenant_id: v.tenant_id,
      unit_id: v.unit_id,
    }, db);
    summary.lancamentosCriadosOuAtualizados += 1;
  }

  return summary;
}

async function sincronizarFinanceiro(scope, client = null) {
  const resolvedScope = normalizeScope(scope);
  const summary = createSyncSummary();
  await sincronizarLancamentosMensalidades(resolvedScope, client, summary);
  await sincronizarLancamentosVendas(resolvedScope, client, summary);
  return summary;
}

module.exports = {
  categoriaDaRede,
  upsertLancamentoFinanceiro,
  reconciliarLancamentoAgregadoMensalidade,
  sincronizarFinanceiro,
  sincronizarLancamentosMensalidades,
  sincronizarLancamentosVendas,
};
