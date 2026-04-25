const express = require('express');
const router = express.Router();
const { runQuery, runExecute } = require('../dbHelper');
const { requireScope } = require('../helpers/scope');

router.get('/', async (req, res) => {
  try {
    const scope = requireScope(req);
    const { ano, mes, tipo } = req.query;
    let sql = 'SELECT * FROM orcamento WHERE tenant_id = ? AND unit_id = ?';
    const params = [scope.tenant_id, scope.unit_id];

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

    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar orcamentos' });
  }
});

router.post('/', async (req, res) => {
  try {
    const scope = requireScope(req);
    const { ano, mes, tipo, valor_previsto, descricao } = req.body;
    const result = await runExecute(
      `INSERT INTO orcamento (ano, mes, tipo, valor_previsto, descricao, tenant_id, unit_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [ano, mes, tipo, valor_previsto, descricao, scope.tenant_id, scope.unit_id]
    );
    res.status(201).json({ id: result.id });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao cadastrar orcamento' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const scope = requireScope(req);
    const { ano, mes, tipo, valor_previsto, descricao } = req.body;
    const { id } = req.params;
    await runExecute(
      `UPDATE orcamento
       SET ano = ?, mes = ?, tipo = ?, valor_previsto = ?, descricao = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND unit_id = ?`,
      [ano, mes, tipo, valor_previsto, descricao, id, scope.tenant_id, scope.unit_id]
    );
    res.json({ message: 'Orcamento atualizado' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar orcamento' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const scope = requireScope(req);
    const { id } = req.params;
    await runExecute('DELETE FROM orcamento WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
    res.json({ message: 'Orcamento excluido' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir orcamento' });
  }
});

module.exports = router;
