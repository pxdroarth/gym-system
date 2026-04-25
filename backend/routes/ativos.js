const express = require('express');
const router = express.Router();
const { runQuery, runExecute } = require('../dbHelper');
const { requireScope } = require('../helpers/scope');

router.get('/', async (req, res) => {
  try {
    const scope = requireScope(req);
    const { tipo, status } = req.query;
    let sql = 'SELECT * FROM ativo WHERE tenant_id = ? AND unit_id = ?';
    const params = [scope.tenant_id, scope.unit_id];

    if (tipo) {
      sql += ' AND tipo = ?';
      params.push(tipo);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar ativos' });
  }
});

router.post('/', async (req, res) => {
  try {
    const scope = requireScope(req);
    const { nome, tipo, valor_aquisicao, data_aquisicao, status, observacao } = req.body;
    const result = await runExecute(
      `INSERT INTO ativo (nome, tipo, valor_aquisicao, data_aquisicao, status, observacao, tenant_id, unit_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [nome, tipo, valor_aquisicao, data_aquisicao, status, observacao, scope.tenant_id, scope.unit_id]
    );
    res.status(201).json({ id: result.id });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao cadastrar ativo' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const scope = requireScope(req);
    const { nome, tipo, valor_aquisicao, data_aquisicao, status, observacao } = req.body;
    const { id } = req.params;
    await runExecute(
      `UPDATE ativo
       SET nome = ?, tipo = ?, valor_aquisicao = ?, data_aquisicao = ?, status = ?, observacao = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND unit_id = ?`,
      [nome, tipo, valor_aquisicao, data_aquisicao, status, observacao, id, scope.tenant_id, scope.unit_id]
    );
    res.json({ message: 'Ativo atualizado' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar ativo' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const scope = requireScope(req);
    const { id } = req.params;
    await runExecute('DELETE FROM ativo WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
    res.json({ message: 'Ativo excluido' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir ativo' });
  }
});

module.exports = router;
