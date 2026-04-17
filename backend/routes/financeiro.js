const express = require('express');
const router = express.Router();
const { runQuery, runGet } = require('../dbHelper');

// Utilitário para formatar datas no padrão YYYY-MM-DD
const ymd = (d) => d.toISOString().slice(0, 10);

// -------------------
// 1) KPIs da dashboard
// -------------------
router.get('/kpis', async (req, res) => {
  try {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ini = ymd(inicio);
    const fim = ymd(hoje);

    const mensalidades = await runGet(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'pago' THEN valor_cobrado ELSE 0 END), 0) AS receita_mensalidades,
        COALESCE(SUM(CASE WHEN status = 'em_aberto' THEN valor_cobrado ELSE 0 END), 0) AS pendencias
      FROM mensalidade
      WHERE vencimento BETWEEN ? AND ?
    `, [ini, fim]);

    const vendas = await runGet(`
      SELECT COALESCE(SUM(quantidade * preco_unitario), 0) AS receita_vendas
      FROM venda_produto
      WHERE data_venda BETWEEN ? AND ?
    `, [ini, fim]);

    let despesas = 0;
    try {
      const r = await runGet(`
        SELECT COALESCE(SUM(valor), 0) AS total
        FROM conta_financeira
        WHERE tipo = 'despesa' AND data_lancamento BETWEEN ? AND ?
      `, [ini, fim]);
      despesas = r.total;
    } catch (_) {}

    const receita_total = mensalidades.receita_mensalidades + vendas.receita_vendas;
    const saldo_atual = receita_total - despesas;

    res.json({
      receita_total,
      receita_mensalidades: mensalidades.receita_mensalidades,
      receita_vendas: vendas.receita_vendas,
      despesas_total: despesas,
      saldo_atual,
      pendencias: mensalidades.pendencias
    });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao calcular KPIs' });
  }
});

// --------------------------------------
// 2) Fluxo de caixa (gráfico de entradas/saídas)
// --------------------------------------
router.get('/fluxo', async (req, res) => {
  try {
    const { periodo = 'mensal' } = req.query;
    const hoje = new Date();

    let inicio;
    switch (periodo) {
      case 'diario':
        inicio = hoje;
        break;
      case 'semanal':
        inicio = new Date(hoje);
        inicio.setDate(hoje.getDate() - hoje.getDay());
        break;
      case 'mensal':
      default:
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        break;
    }

    const ini = ymd(inicio);
    const fim = ymd(hoje);

    const entradas = await runQuery(`
      SELECT DATE(d) AS dia, SUM(v) AS total
      FROM (
        SELECT data_pagamento AS d, valor_pago AS v FROM pagamento
        UNION ALL
        SELECT data_venda AS d, quantidade * preco_unitario AS v FROM venda_produto
        UNION ALL
        SELECT data_lancamento AS d, valor AS v FROM conta_financeira WHERE tipo = 'receita'
      ) t
      WHERE d BETWEEN ? AND ?
      GROUP BY DATE(d)
      ORDER BY DATE(d)
    `, [ini, fim]);

    const saidas = await runQuery(`
      SELECT DATE(data_lancamento) AS dia, SUM(valor) AS total
      FROM conta_financeira
      WHERE tipo = 'despesa' AND data_lancamento BETWEEN ? AND ?
      GROUP BY DATE(data_lancamento)
    `, [ini, fim]);

    const toSerie = (rows, id) => ({
      id,
      data: rows.map(r => ({
        x: new Date(r.dia).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        y: Number(r.total)
      }))
    });

    res.json([
      toSerie(entradas, 'Entradas'),
      toSerie(saidas, 'Saídas')
    ]);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao gerar fluxo de caixa' });
  }
});

// ----------------------------
// 3) Gráfico: Mensalidades
// ----------------------------
router.get('/mensalidades', async (req, res) => {
  const { data_inicial, data_final, status = 'todos' } = req.query;
  let sql = 'SELECT status, valor_cobrado FROM mensalidade WHERE 1=1';
  const params = [];
  if (data_inicial) { sql += ' AND vencimento >= ?'; params.push(data_inicial); }
  if (data_final)   { sql += ' AND vencimento <= ?'; params.push(data_final); }
  if (status !== 'todos') { sql += ' AND status = ?'; params.push(status); }

  try {
    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar mensalidades' });
  }
});

// ----------------------------
// 4) Gráfico: Vendas de produtos
// ----------------------------
router.get('/vendas-produtos', async (req, res) => {
  const { data_inicial, data_final } = req.query;
  let sql = 'SELECT quantidade, preco_unitario FROM venda_produto WHERE 1=1';
  const params = [];
  if (data_inicial) { sql += ' AND data_venda >= ?'; params.push(data_inicial); }
  if (data_final)   { sql += ' AND data_venda <= ?'; params.push(data_final); }

  try {
    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar vendas' });
  }
});

module.exports = router;
