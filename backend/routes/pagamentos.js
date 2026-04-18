const express = require('express');
const router = express.Router();
const { runQuery } = require('../dbHelper');
const MensalidadeService = require('../services/MensalidadeService');
const { sincronizarFinanceiro } = require('../services/FinanceService');

router.post('/', async (req, res, next) => {
  try {
    const pagamento = await MensalidadeService.registrarPagamento(req.body || {});
    await sincronizarFinanceiro();
    res.status(201).json(pagamento);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const rows = await runQuery(`
      SELECT p.*, m.aluno_id, m.vencimento, m.valor_cobrado
      FROM pagamento p
      LEFT JOIN mensalidade m ON m.id = p.mensalidade_id
      ORDER BY DATE(p.data_pagamento) DESC, p.id DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/aluno/:aluno_id', async (req, res, next) => {
  const alunoId = parseInt(req.params.aluno_id);
  try {
    const rows = await runQuery(`
      SELECT p.*, m.vencimento, m.valor_cobrado
      FROM pagamento p
      JOIN mensalidade m ON p.mensalidade_id = m.id
      WHERE m.aluno_id = ?
      ORDER BY DATE(p.data_pagamento) DESC, p.id DESC
    `, [alunoId]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
