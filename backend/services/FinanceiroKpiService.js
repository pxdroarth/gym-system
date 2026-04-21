const db = require('../dbHelper');
const { obterIntervaloPorPeriodo } = require('../routes/helpers/periodoHelper');

function number(value) {
  return Number(value || 0);
}

async function somarPagamentoMensalidades(dataInicio, dataFim) {
  const row = await db.runGet(`
    SELECT COALESCE(SUM(valor_pago), 0) AS total
    FROM pagamento
    WHERE data_pagamento IS NOT NULL
      AND DATE(data_pagamento) BETWEEN DATE(?) AND DATE(?)
  `, [dataInicio, dataFim]);

  return number(row?.total);
}

async function somarMensalidadesPagasLegadas(dataInicio, dataFim) {
  const row = await db.runGet(`
    SELECT COALESCE(SUM(m.valor_cobrado), 0) AS total
    FROM mensalidade m
    WHERE m.status = 'pago'
      AND COALESCE(m.deleted_at, '') = ''
      AND NOT EXISTS (
        SELECT 1
        FROM pagamento p
        WHERE p.mensalidade_id = m.id
          AND p.data_pagamento IS NOT NULL
      )
      AND m.vencimento IS NOT NULL
      AND m.vencimento != '0000-00-00'
      AND DATE(COALESCE(m.updated_at, m.vencimento)) BETWEEN DATE(?) AND DATE(?)
  `, [dataInicio, dataFim]);

  return number(row?.total);
}

async function somarVendasRecebidas(dataInicio, dataFim) {
  const row = await db.runGet(`
    SELECT COALESCE(SUM(COALESCE(valor_total, quantidade * preco_unitario)), 0) AS total
    FROM venda_produto
    WHERE COALESCE(deleted_at, '') = ''
      AND DATE(data_venda) BETWEEN DATE(?) AND DATE(?)
  `, [dataInicio, dataFim]);

  return number(row?.total);
}

async function somarReceitasFinanceirasAvulsas(dataInicio, dataFim) {
  const row = await db.runGet(`
    SELECT COALESCE(SUM(valor), 0) AS total
    FROM conta_financeira
    WHERE COALESCE(deleted_at, '') = ''
      AND tipo = 'receita'
      AND status = 'pago'
      AND (
        origem IS NULL
        OR origem = 'conta_financeira'
        OR origem = 'reversao_controlada'
      )
      AND DATE(data_lancamento) BETWEEN DATE(?) AND DATE(?)
  `, [dataInicio, dataFim]);

  return number(row?.total);
}

async function obterDespesas(dataInicio, dataFim) {
  const row = await db.runGet(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END), 0) AS pagas,
      COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS pendentes
    FROM conta_financeira
    WHERE COALESCE(deleted_at, '') = ''
      AND tipo = 'despesa'
      AND (
        origem IS NULL
        OR origem = 'conta_financeira'
        OR origem = 'reversao_controlada'
      )
      AND DATE(data_lancamento) BETWEEN DATE(?) AND DATE(?)
  `, [dataInicio, dataFim]);

  return {
    pagas: number(row?.pagas),
    pendentes: number(row?.pendentes),
  };
}

async function obterReceitasAReceber(dataInicio, dataFim) {
  const row = await db.runGet(`
    SELECT COALESCE(SUM(valor_cobrado), 0) AS a_receber,
           COUNT(DISTINCT aluno_id) AS clientes_pendentes
    FROM mensalidade
    WHERE status IN ('em_aberto', 'parcial')
      AND COALESCE(deleted_at, '') = ''
      AND vencimento IS NOT NULL
      AND vencimento != '0000-00-00'
      AND DATE(vencimento) BETWEEN DATE(?) AND DATE(?)
  `, [dataInicio, dataFim]);

  return {
    aReceber: number(row?.a_receber),
    clientesPendentes: number(row?.clientes_pendentes),
  };
}

async function calcularKpisFinanceiros({ periodo = 'mensal', data_inicio, data_fim } = {}) {
  const { dataInicio, dataFim } = obterIntervaloPorPeriodo(periodo, data_inicio, data_fim);

  const [
    pagamentosMensalidades,
    mensalidadesLegadas,
    vendasRecebidas,
    receitasAvulsas,
    despesas,
    pendencias,
  ] = await Promise.all([
    somarPagamentoMensalidades(dataInicio, dataFim),
    somarMensalidadesPagasLegadas(dataInicio, dataFim),
    somarVendasRecebidas(dataInicio, dataFim),
    somarReceitasFinanceirasAvulsas(dataInicio, dataFim),
    obterDespesas(dataInicio, dataFim),
    obterReceitasAReceber(dataInicio, dataFim),
  ]);

  const mensalidadesRecebidas = pagamentosMensalidades + mensalidadesLegadas;
  const receitaRealTotal = mensalidadesRecebidas + vendasRecebidas + receitasAvulsas;
  const lucroReal = receitaRealTotal - despesas.pagas;

  return {
    mensalidades_recebidas: mensalidadesRecebidas,
    vendas_recebidas: vendasRecebidas,
    receita_real_total: receitaRealTotal,
    despesas_pagas: despesas.pagas,
    despesas_a_pagar: despesas.pendentes,
    lucro_real: lucroReal,
    saldo_atual: lucroReal,
    a_receber: pendencias.aReceber,
    clientes_pendentes: pendencias.clientesPendentes,
    variacao_mensal: 0,
    periodo_aplicado: {
      periodo,
      data_inicio: dataInicio,
      data_fim: dataFim,
    },
    receitas_avulsas: receitasAvulsas,
  };
}

module.exports = {
  calcularKpisFinanceiros,
};
