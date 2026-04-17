const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');

function normalizePlanoPayload(body = {}) {
  const nome = String(body.nome || '').trim();
  const valor_base = Number(body.valor_base);
  const descricao = body.descricao ? String(body.descricao).trim() : null;
  const duracao_em_dias = Number(body.duracao_em_dias || 30);
  const compartilhado = Number(body.compartilhado ? 1 : 0);
  const quantidade_max_pessoas = Number(body.quantidade_max_pessoas || 1);

  return {
    nome,
    valor_base,
    descricao,
    duracao_em_dias,
    compartilhado,
    quantidade_max_pessoas,
  };
}

function validarPlano(payload) {
  if (!payload.nome) return 'nome é obrigatório';
  if (!Number.isFinite(payload.valor_base) || payload.valor_base <= 0) return 'valor_base inválido';
  if (!Number.isInteger(payload.duracao_em_dias) || payload.duracao_em_dias <= 0) return 'duracao_em_dias inválida';
  if (!Number.isInteger(payload.quantidade_max_pessoas) || payload.quantidade_max_pessoas <= 0) return 'quantidade_max_pessoas inválida';
  if (payload.quantidade_max_pessoas > 1 && payload.compartilhado !== 1) return 'Planos com mais de 1 pessoa devem ser compartilhados';
  if (payload.quantidade_max_pessoas === 1 && payload.compartilhado !== 0) return 'Plano individual deve ter compartilhado = 0';
  return null;
}

router.get('/', async (req, res) => {
  try {
    const { compartilhado, q } = req.query;
    const filtros = [];
    const params = [];

    if (compartilhado === '0' || compartilhado === '1') {
      filtros.push('compartilhado = ?');
      params.push(Number(compartilhado));
    }

    if (q) {
      filtros.push('LOWER(nome) LIKE ?');
      params.push(`%${String(q).trim().toLowerCase()}%`);
    }

    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const rows = await runQuery(`
      SELECT *,
             CASE
               WHEN quantidade_max_pessoas > 1 THEN quantidade_max_pessoas - 1
               ELSE 0
             END AS max_vinculados
      FROM plano
      ${where}
      ORDER BY valor_base ASC, nome ASC
    `, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const row = await runGet(`
      SELECT *,
             CASE
               WHEN quantidade_max_pessoas > 1 THEN quantidade_max_pessoas - 1
               ELSE 0
             END AS max_vinculados
      FROM plano
      WHERE id = ?
    `, [id]);

    if (!row) return res.status(404).json({ error: 'Plano não encontrado' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  const payload = normalizePlanoPayload(req.body);
  const erro = validarPlano(payload);
  if (erro) return res.status(400).json({ error: erro });

  try {
    const existente = await runGet('SELECT id FROM plano WHERE LOWER(nome) = LOWER(?) LIMIT 1', [payload.nome]);
    if (existente) return res.status(409).json({ error: 'Já existe um plano com esse nome' });

    const result = await runExecute(
      `INSERT INTO plano (nome, valor_base, descricao, duracao_em_dias, compartilhado, quantidade_max_pessoas)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        payload.nome,
        payload.valor_base,
        payload.descricao,
        payload.duracao_em_dias,
        payload.compartilhado,
        payload.quantidade_max_pessoas,
      ]
    );

    const criado = await runGet('SELECT * FROM plano WHERE id = ?', [result.lastID]);
    res.status(201).json(criado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const payload = normalizePlanoPayload(req.body);
  const erro = validarPlano(payload);
  if (erro) return res.status(400).json({ error: erro });

  try {
    const atual = await runGet('SELECT * FROM plano WHERE id = ?', [id]);
    if (!atual) return res.status(404).json({ error: 'Plano não encontrado para atualizar' });

    const ocupacao = await runGet(
      `SELECT COUNT(*) AS total FROM aluno WHERE plano_id = ? AND status = 'ativo'`,
      [id]
    );

    if ((ocupacao?.total || 0) > payload.quantidade_max_pessoas) {
      return res.status(400).json({
        error: 'Não é possível reduzir quantidade_max_pessoas abaixo do total atual de alunos ativos neste plano'
      });
    }

    await runExecute(
      `UPDATE plano
       SET nome = ?, valor_base = ?, descricao = ?, duracao_em_dias = ?, compartilhado = ?, quantidade_max_pessoas = ?
       WHERE id = ?`,
      [
        payload.nome,
        payload.valor_base,
        payload.descricao,
        payload.duracao_em_dias,
        payload.compartilhado,
        payload.quantidade_max_pessoas,
        id,
      ]
    );

    const atualizado = await runGet('SELECT * FROM plano WHERE id = ?', [id]);
    res.json(atualizado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const alunosAtivos = await runGet('SELECT COUNT(*) AS total FROM aluno WHERE plano_id = ?', [id]);
    if ((alunosAtivos?.total || 0) > 0) {
      return res.status(400).json({ error: 'Não é possível excluir um plano vinculado a alunos' });
    }

    const result = await runExecute('DELETE FROM plano WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Plano não encontrado para deletar' });
    res.json({ message: 'Plano deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
