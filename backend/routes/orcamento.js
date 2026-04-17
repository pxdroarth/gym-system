// routes/orcamento.js
const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');

// GET /orcamento - Lista todos os orçamentos (com filtros: ano, mes, tipo)
router.get('/', async (req, res) => {
  const { ano, mes, tipo } = req.query;
  let sql = 'SELECT * FROM orcamento WHERE 1=1';
  const params = [];
  if (ano) {
    sql += ' AND ano = ?';
    params.push(ano);
  }
  if (mes) {
    sql += ' AND mes = ?';
    params.push(mes);
  }
  if (tipo) {
    sql += ' AND tipo = ?';
    params.push(tipo);
  }
  try {
    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar orçamentos' });
  }
});

// POST /orcamento - Cadastrar novo orçamento
router.post('/', async (req, res) => {
  const { ano, mes, tipo, valor_previsto, descricao } = req.body;
  try {
    const result = await runExecute(
      `INSERT INTO orcamento (ano, mes, tipo, valor_previsto, descricao, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [ano, mes, tipo, valor_previsto, descricao]
    );
    res.status(201).json({ id: result.id });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao cadastrar orçamento' });
  }
});

// PUT /orcamento/:id - Editar orçamento
router.put('/:id', async (req, res) => {
  const { ano, mes, tipo, valor_previsto, descricao } = req.body;
  const { id } = req.params;
  try {
    await runExecute(
      `UPDATE orcamento SET ano=?, mes=?, tipo=?, valor_previsto=?, descricao=?, updated_at=datetime('now') WHERE id=?`,
      [ano, mes, tipo, valor_previsto, descricao, id]
    );
    res.json({ message: 'Orçamento atualizado' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar orçamento' });
  }
});

// DELETE /orcamento/:id - Excluir orçamento
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await runExecute('DELETE FROM orcamento WHERE id=?', [id]);
    res.json({ message: 'Orçamento excluído' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir orçamento' });
  }
});

module.exports = router;
