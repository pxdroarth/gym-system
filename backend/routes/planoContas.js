const express = require('express');
const router = express.Router();
const { runQuery, runExecute } = require('../dbHelper');
const { requireScope } = require('../helpers/scope');

router.get('/', async (req, res) => {
  try {
    const scope = requireScope(req);
    const rows = await runQuery(
      'SELECT * FROM plano_contas WHERE tenant_id = ? ORDER BY nome COLLATE NOCASE',
      [scope.tenant_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar plano de contas', detalhes: err.message });
  }
});

router.post('/', async (req, res) => {
  const { nome, tipo, descricao, quantidade_sugerida, dia_sugerido } = req.body;
  if (!nome || !tipo) return res.status(400).json({ erro: 'Nome e tipo sao obrigatorios' });

  try {
    const scope = requireScope(req);
    const result = await runExecute(`
      INSERT INTO plano_contas (nome, tipo, descricao, quantidade_sugerida, dia_sugerido, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      nome,
      tipo,
      descricao || null,
      Number.isNaN(parseInt(quantidade_sugerida)) ? null : parseInt(quantidade_sugerida),
      Number.isNaN(parseInt(dia_sugerido)) ? null : parseInt(dia_sugerido),
      scope.tenant_id,
    ]);
    res.status(201).json({ id: result.id, nome });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar conta', detalhes: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { nome, tipo, descricao, quantidade_sugerida, dia_sugerido } = req.body;
  if (!nome || !tipo) return res.status(400).json({ erro: 'Nome e tipo sao obrigatorios' });

  try {
    const scope = requireScope(req);
    const result = await runExecute(`
      UPDATE plano_contas SET
        nome = ?, tipo = ?, descricao = ?, quantidade_sugerida = ?, dia_sugerido = ?
      WHERE id = ? AND tenant_id = ?
    `, [
      nome,
      tipo,
      descricao || null,
      quantidade_sugerida || null,
      dia_sugerido || null,
      id,
      scope.tenant_id,
    ]);
    if (result.changes === 0) {
      return res.status(404).json({ erro: 'Plano de conta nao encontrado' });
    }
    res.json({ message: 'Conta atualizada com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar conta', detalhes: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const scope = requireScope(req);
    const result = await runExecute('DELETE FROM plano_contas WHERE id = ? AND tenant_id = ?', [id, scope.tenant_id]);
    if (result.changes === 0) {
      return res.status(404).json({ erro: 'Plano de conta nao encontrado para excluir' });
    }
    res.json({ mensagem: 'Conta removida com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover conta', detalhes: err.message });
  }
});

module.exports = router;
