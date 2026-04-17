const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');
const { sincronizarFinanceiro } = require('../services/FinanceService');

router.get('/', async (req, res) => {
  const { data_inicial, data_final, pagina = 1, limite = 10 } = req.query;
  const offset = (parseInt(pagina) - 1) * parseInt(limite);
  const params = [];

  let filtros = 'WHERE 1=1';
  if (data_inicial) {
    filtros += ' AND DATE(vp.data_venda) >= DATE(?)';
    params.push(data_inicial);
  }
  if (data_final) {
    filtros += ' AND DATE(vp.data_venda) <= DATE(?)';
    params.push(data_final);
  }

  try {
    const sql = `
      SELECT vp.id, vp.produto_id, vp.produto_nome, vp.quantidade, vp.preco_unitario, vp.valor_total, vp.data_venda
      FROM venda_produto vp
      ${filtros}
      ORDER BY datetime(vp.data_venda) DESC, vp.id DESC
      LIMIT ? OFFSET ?
    `;
    const vendas = await runQuery(sql, [...params, parseInt(limite), offset]);

    const countSql = `SELECT COUNT(*) as total FROM venda_produto vp ${filtros}`;
    const countResult = await runGet(countSql, params);
    const total = countResult?.total || 0;

    res.json({ vendas, total, pagina: Number(pagina), limite: Number(limite) });
  } catch (error) {
    console.error('❌ Erro ao listar vendas:', error);
    res.status(500).json({ error: 'Erro ao listar vendas' });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const venda = await runGet('SELECT * FROM venda_produto WHERE id = ?', [id]);
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada' });
    res.json(venda);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar venda' });
  }
});

router.post('/', async (req, res) => {
  const { produto_id, quantidade, preco_unitario } = req.body || {};

  if (!produto_id || !quantidade || !preco_unitario) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  try {
    const produto = await runGet('SELECT nome, estoque, preco FROM produto WHERE id = ?', [produto_id]);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    const qtd = Number(quantidade);
    const precoUnit = Number(preco_unitario || produto.preco);

    if (!Number.isInteger(qtd) || qtd <= 0) return res.status(400).json({ error: 'quantidade inválida' });
    if (!Number.isFinite(precoUnit) || precoUnit <= 0) return res.status(400).json({ error: 'preco_unitario inválido' });
    if (Number(produto.estoque) < qtd) return res.status(400).json({ error: 'Estoque insuficiente' });

    const valor_total = qtd * precoUnit;

    const venda = await runExecute(
      `INSERT INTO venda_produto (produto_id, produto_nome, quantidade, preco_unitario, valor_total)
       VALUES (?, ?, ?, ?, ?)`,
      [produto_id, produto.nome, qtd, precoUnit, valor_total]
    );

    await runExecute('UPDATE produto SET estoque = estoque - ? WHERE id = ?', [qtd, produto_id]);
    await sincronizarFinanceiro();

    res.status(201).json({
      id: venda.lastID,
      produto_id,
      produto_nome: produto.nome,
      quantidade: qtd,
      preco_unitario: precoUnit,
      valor_total,
    });
  } catch (error) {
    console.error('❌ Erro ao registrar venda:', error);
    res.status(500).json({ error: 'Erro interno ao registrar venda' });
  }
});

module.exports = router;
