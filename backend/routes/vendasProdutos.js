const express = require('express');
const router = express.Router();
const { runQuery, runGet } = require('../dbHelper');
const VendaService = require('../services/VendaService');
const AuditService = require('../services/AuditService');
const ReversaoControladaService = require('../services/ReversaoControladaService');

router.get('/', async (req, res, next) => {
  const { data_inicial, data_final, pagina = 1, limite = 10 } = req.query;
  const offset = (parseInt(pagina) - 1) * parseInt(limite);
  const params = [];

  let filtros = 'WHERE vp.deleted_at IS NULL';
  if (data_inicial) {
    filtros += ' AND DATE(vp.data_venda) >= DATE(?)';
    params.push(data_inicial);
  }
  if (data_final) {
    filtros += ' AND DATE(vp.data_venda) <= DATE(?)';
    params.push(data_final);
  }

  try {
    const vendas = await runQuery(`
      SELECT vp.id, vp.produto_id, vp.produto_nome, vp.quantidade, vp.preco_unitario, vp.valor_total, vp.data_venda
      FROM venda_produto vp
      ${filtros}
      ORDER BY datetime(vp.data_venda) DESC, vp.id DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limite), offset]);

    const countResult = await runGet(`SELECT COUNT(*) as total FROM venda_produto vp ${filtros}`, params);
    res.json({ vendas, total: countResult?.total || 0, pagina: Number(pagina), limite: Number(limite) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalido' });

  try {
    const venda = await runGet('SELECT * FROM venda_produto WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!venda) return res.status(404).json({ error: 'Venda nao encontrada' });
    res.json(venda);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const venda = await VendaService.registrarVenda(
      req.body || {},
      AuditService.getActorFromRequest(req)
    );
    res.status(201).json(venda);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reverter', async (req, res, next) => {
  try {
    const resultado = await ReversaoControladaService.reverterVenda(
      req.params.id,
      req.body || {},
      AuditService.getActorFromRequest(req)
    );
    res.json({ ok: true, data: resultado, message: 'Venda revertida com controle' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
