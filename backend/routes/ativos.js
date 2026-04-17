// routes/ativos.js
const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');

// GET /ativos - Lista de ativos (com filtros opcionais: tipo, status, data_compra)
router.get('/', async (req, res) => {
  const { tipo, status } = req.query;
  let sql = 'SELECT * FROM ativo WHERE 1=1';
  const params = [];
  if (tipo) {
    sql += ' AND tipo = ?';
    params.push(tipo);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  try {
    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar ativos' });
  }
});

// POST /ativos - Cadastrar ativo
router.post('/', async (req, res) => {
  const { nome, tipo, valor_aquisicao, data_aquisicao, status, observacao } = req.body;
  try {
    const result = await runExecute(
      `INSERT INTO ativo (nome, tipo, valor_aquisicao, data_aquisicao, status, observacao, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [nome, tipo, valor_aquisicao, data_aquisicao, status, observacao]
    );
    res.status(201).json({ id: result.id });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao cadastrar ativo' });
  }
});

// PUT /ativos/:id - Editar ativo
router.put('/:id', async (req, res) => {
  const { nome, tipo, valor_aquisicao, data_aquisicao, status, observacao } = req.body;
  const { id } = req.params;
  try {
    await runExecute(
      `UPDATE ativo SET nome=?, tipo=?, valor_aquisicao=?, data_aquisicao=?, status=?, observacao=?, updated_at=datetime('now') WHERE id=?`,
      [nome, tipo, valor_aquisicao, data_aquisicao, status, observacao, id]
    );
    res.json({ message: 'Ativo atualizado' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar ativo' });
  }
});

// DELETE /ativos/:id - Excluir ativo
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await runExecute('DELETE FROM ativo WHERE id=?', [id]);
    res.json({ message: 'Ativo excluído' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir ativo' });
  }
});

module.exports = router;
