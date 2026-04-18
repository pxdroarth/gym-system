const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');
const AccessService = require('../services/AccessService');
const AppError = require('../errors/AppError');

router.get('/', async (_req, res, next) => {
  try {
    const rows = await runQuery(`
      SELECT ac.*, a.nome AS aluno_nome
      FROM acesso ac
      LEFT JOIN aluno a ON a.id = ac.aluno_id
      ORDER BY datetime(ac.data_hora) DESC, ac.id DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/aluno/:alunoId', async (req, res, next) => {
  const alunoId = parseInt(req.params.alunoId);
  const pagina = parseInt(req.query.pagina) || 1;
  const limite = parseInt(req.query.limite) || 10;

  if (isNaN(alunoId) || alunoId <= 0) {
    return next(new AppError('ID de aluno invalido', 400, 'ALUNO_ID_INVALIDO'));
  }

  const offset = (pagina - 1) * limite;

  try {
    const totalRow = await runGet('SELECT COUNT(*) as total FROM acesso WHERE aluno_id = ?', [alunoId]);
    const total = totalRow?.total || 0;

    const acessos = await runQuery(
      'SELECT * FROM acesso WHERE aluno_id = ? ORDER BY datetime(data_hora) DESC, id DESC LIMIT ? OFFSET ?',
      [alunoId, limite, offset]
    );

    res.json({ acessos, total, pagina, limite });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  try {
    const row = await runGet('SELECT * FROM acesso WHERE id = ?', [id]);
    if (!row) return next(new AppError('Acesso nao encontrado', 404, 'ACESSO_NAO_ENCONTRADO'));
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const acesso = await AccessService.registrarAcesso(req.body || {});
    res.status(201).json(acesso);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { aluno_id, data_hora, resultado, motivo_bloqueio } = req.body;

  if (!aluno_id || !resultado || !data_hora) {
    return next(new AppError('Campos obrigatorios: aluno_id, resultado, data_hora', 400, 'ACESSO_PAYLOAD_INVALIDO'));
  }

  try {
    const resultadoNormalizado = String(resultado).toLowerCase();
    const result = await runExecute(
      'UPDATE acesso SET aluno_id = ?, data_hora = ?, resultado = ?, motivo_bloqueio = ? WHERE id = ?',
      [aluno_id, data_hora, resultadoNormalizado, motivo_bloqueio || null, id]
    );

    if (result.changes === 0) {
      return next(new AppError('Acesso nao encontrado para atualizar', 404, 'ACESSO_NAO_ENCONTRADO'));
    }

    res.json({ id, aluno_id, data_hora, resultado: resultadoNormalizado, motivo_bloqueio: motivo_bloqueio || null });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  try {
    const result = await runExecute('DELETE FROM acesso WHERE id = ?', [id]);
    if (result.changes === 0) {
      return next(new AppError('Acesso nao encontrado para deletar', 404, 'ACESSO_NAO_ENCONTRADO'));
    }
    res.json({ message: 'Acesso deletado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.post('/mock-hikvision', async (req, res, next) => {
  const { aluno_id } = req.body || {};

  if (!aluno_id) {
    return next(new AppError('aluno_id e obrigatorio', 400, 'ALUNO_ID_OBRIGATORIO'));
  }

  try {
    const resultado = await AccessService.registrarTentativaAcesso(aluno_id);
    res.status(201).json(resultado);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
