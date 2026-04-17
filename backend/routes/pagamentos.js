const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');
const { sincronizarFinanceiro } = require('../services/FinanceService');

router.post('/', async (req, res) => {
  const { mensalidade_id, data_pagamento, valor_pago } = req.body || {};
  const dataPagamentoFinal = data_pagamento || new Date().toISOString().slice(0, 10);

  if (!mensalidade_id || valor_pago === undefined || valor_pago === null || valor_pago === '') {
    return res.status(400).json({ erro: 'Campos obrigatórios faltando' });
  }

  try {
    const mensalidade = await runGet('SELECT * FROM mensalidade WHERE id = ?', [mensalidade_id]);
    if (!mensalidade) return res.status(404).json({ error: 'Mensalidade não encontrada' });

    if (mensalidade.status === 'cancelado') {
      return res.status(400).json({ error: 'Mensalidade cancelada não pode ser paga' });
    }

    const valor = Number(valor_pago);
    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({ error: 'valor_pago inválido' });
    }

    const existente = await runGet('SELECT id FROM pagamento WHERE mensalidade_id = ?', [mensalidade_id]);
    let pagamentoId;

    if (existente) {
      await runExecute(
        'UPDATE pagamento SET data_pagamento = ?, valor_pago = ?, valor_previsto = ? WHERE id = ?',
        [dataPagamentoFinal, valor, mensalidade.valor_cobrado, existente.id]
      );
      pagamentoId = existente.id;
    } else {
      const result = await runExecute(
        'INSERT INTO pagamento (mensalidade_id, data_pagamento, valor_pago, valor_previsto) VALUES (?, ?, ?, ?)',
        [mensalidade_id, dataPagamentoFinal, valor, mensalidade.valor_cobrado]
      );
      pagamentoId = result.lastID;
    }

    await runExecute(
      "UPDATE mensalidade SET status = 'pago', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [mensalidade_id]
    );

    await sincronizarFinanceiro();

    res.status(201).json({
      id: pagamentoId,
      mensalidade_id,
      data_pagamento: dataPagamentoFinal,
      valor_pago: valor,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (_req, res) => {
  try {
    const rows = await runQuery(`
      SELECT p.*, m.aluno_id, m.vencimento, m.valor_cobrado
      FROM pagamento p
      LEFT JOIN mensalidade m ON m.id = p.mensalidade_id
      ORDER BY DATE(p.data_pagamento) DESC, p.id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/aluno/:aluno_id', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
