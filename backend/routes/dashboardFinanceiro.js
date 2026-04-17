const express = require('express');
const router = express.Router();
const db = require('../dbHelper');
const { obterIntervaloPorPeriodo } = require('./helpers/periodoHelper');
const { sincronizarFinanceiro } = require('../services/FinanceService');

router.get('/', async (_req, res) => {
  try {
    const contas = await db.runQuery(
      `SELECT * FROM conta_financeira WHERE origem = 'conta_financeira' ORDER BY data_lancamento DESC`
    );
    res.json(contas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/kpis', async (req, res) => {
  try {
    const { periodo = 'mes_atual', data_inicio, data_fim } = req.query;
    const { dataInicio, dataFim } = obterIntervaloPorPeriodo(periodo, data_inicio, data_fim);

    const pagosQuery = `
      SELECT COALESCE(SUM(valor_pago), 0) AS total_pagamento
      FROM pagamento
      WHERE data_pagamento IS NOT NULL
        AND data_pagamento BETWEEN ? AND ?
    `;
    const totalPagamentos = Number((await db.runGet(pagosQuery, [dataInicio, dataFim])).total_pagamento || 0);

    const mensalidadesAntigasQuery = `
      SELECT COALESCE(SUM(m.valor_cobrado), 0) AS total_mensalidade
      FROM mensalidade m
      WHERE m.status = 'pago'
        AND NOT EXISTS (
          SELECT 1 FROM pagamento p
          WHERE p.mensalidade_id = m.id AND p.data_pagamento IS NOT NULL
        )
        AND COALESCE(m.updated_at, m.vencimento) BETWEEN ? AND ?
        AND m.vencimento IS NOT NULL
        AND m.vencimento != '0000-00-00'
    `;
    const totalMensalidadesAntigas = Number((await db.runGet(mensalidadesAntigasQuery, [dataInicio, dataFim])).total_mensalidade || 0);

    const mensalidadesRecebidas = totalPagamentos + totalMensalidadesAntigas;

    const vendasQuery = `
      SELECT COALESCE(SUM(quantidade * preco_unitario), 0) AS vendas_recebidas
      FROM venda_produto
      WHERE data_venda BETWEEN ? AND ?
    `;
    const vendasRecebidas = Number((await db.runGet(vendasQuery, [dataInicio, dataFim])).vendas_recebidas || 0);

    const despesasQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END), 0) AS despesas_pagas,
        COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) AS despesas_pendentes
      FROM conta_financeira
      WHERE data_lancamento BETWEEN ? AND ?
        AND tipo = 'despesa'
        AND origem = 'conta_financeira'
    `;
    const despesasData = await db.runGet(despesasQuery, [dataInicio, dataFim]);
    const despesasPagas = Number(despesasData.despesas_pagas || 0);
    const despesasPendentes = Number(despesasData.despesas_pendentes || 0);

    const aReceberQuery = `
      SELECT COALESCE(SUM(valor_cobrado), 0) AS a_receber,
             COUNT(DISTINCT aluno_id) AS clientes_pendentes
      FROM mensalidade
      WHERE status = 'em_aberto'
        AND vencimento IS NOT NULL
        AND vencimento != '0000-00-00'
        AND DATE(vencimento) BETWEEN DATE(?) AND DATE(MIN(?, DATE('now')))
    `;
    const aReceberData = await db.runGet(aReceberQuery, [dataInicio, dataFim]);

    const receitaRealTotal = mensalidadesRecebidas + vendasRecebidas;
    const lucroReal = receitaRealTotal - despesasPagas;

    res.json({
      mensalidades_recebidas: mensalidadesRecebidas,
      vendas_recebidas: vendasRecebidas,
      receita_real_total: receitaRealTotal,
      despesas_pagas: despesasPagas,
      despesas_a_pagar: despesasPendentes,
      lucro_real: lucroReal,
      saldo_atual: receitaRealTotal - despesasPagas,
      a_receber: Number(aReceberData.a_receber || 0),
      clientes_pendentes: Number(aReceberData.clientes_pendentes || 0),
      variacao_mensal: 0,
    });
  } catch (error) {
    console.error('Erro em /dashboard/financeiro/kpis:', error);
    res.status(500).json({ erro: 'Erro ao gerar KPIs do financeiro' });
  }
});

router.post('/sincronizar', async (_req, res) => {
  try {
    await sincronizarFinanceiro();
    res.json({ ok: true, message: 'Sincronização executada com sucesso!' });
  } catch (e) {
    console.error('Erro ao sincronizar financeiro:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
