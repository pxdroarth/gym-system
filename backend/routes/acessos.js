const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');
const AccessService = require('../services/AccessService');
const AppError = require('../errors/AppError');
const AuditService = require('../services/AuditService');
const { PERMISSIONS } = require('../constants/userRoles');
const { assertPermission } = require('../middlewares/requirePermission');
const { actorWithScope, requireScope } = require('../helpers/scope');

router.get('/', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const rows = await runQuery(`
      SELECT ac.*, a.nome AS aluno_nome
      FROM acesso ac
      LEFT JOIN aluno a ON a.id = ac.aluno_id AND a.tenant_id = ac.tenant_id AND a.unit_id = ac.unit_id
      WHERE ac.tenant_id = ? AND ac.unit_id = ?
      ORDER BY datetime(ac.data_hora) DESC, ac.id DESC
    `, [scope.tenant_id, scope.unit_id]);
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
    const scope = requireScope(req);
    const totalRow = await runGet(
      'SELECT COUNT(*) as total FROM acesso WHERE aluno_id = ? AND tenant_id = ? AND unit_id = ?',
      [alunoId, scope.tenant_id, scope.unit_id]
    );
    const total = totalRow?.total || 0;

    const acessos = await runQuery(
      'SELECT * FROM acesso WHERE aluno_id = ? AND tenant_id = ? AND unit_id = ? ORDER BY datetime(data_hora) DESC, id DESC LIMIT ? OFFSET ?',
      [alunoId, scope.tenant_id, scope.unit_id, limite, offset]
    );

    res.json({ acessos, total, pagina, limite });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  try {
    const scope = requireScope(req);
    const row = await runGet('SELECT * FROM acesso WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
    if (!row) return next(new AppError('Acesso nao encontrado', 404, 'ACESSO_NAO_ENCONTRADO'));
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.body?.liberacao_manual) {
      assertPermission(req, PERMISSIONS.ACESSO_LIBERACAO_MANUAL);
    }

    const scope = requireScope(req);
    const acesso = await AccessService.registrarAcesso(req.body || {}, scope);
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
    const scope = requireScope(req);
    const resultadoNormalizado = String(resultado).toLowerCase();
    const result = await runExecute(
      'UPDATE acesso SET aluno_id = ?, data_hora = ?, resultado = ?, motivo_bloqueio = ? WHERE id = ? AND tenant_id = ? AND unit_id = ?',
      [aluno_id, data_hora, resultadoNormalizado, motivo_bloqueio || null, id, scope.tenant_id, scope.unit_id]
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
    const scope = requireScope(req);
    const result = await runExecute('DELETE FROM acesso WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
    if (result.changes === 0) {
      return next(new AppError('Acesso nao encontrado para deletar', 404, 'ACESSO_NAO_ENCONTRADO'));
    }
    res.json({ message: 'Acesso deletado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.post('/mock-hikvision', async (req, res, next) => {
  const { aluno_id, liberacao_manual, motivo } = req.body || {};

  if (!aluno_id) {
    return next(new AppError('aluno_id e obrigatorio', 400, 'ALUNO_ID_OBRIGATORIO'));
  }

  try {
    const scope = requireScope(req);
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    if (liberacao_manual) {
      assertPermission(req, PERMISSIONS.ACESSO_LIBERACAO_MANUAL);
    }

    const resultado = await AccessService.registrarTentativaAcesso(aluno_id, {
      liberacaoManual: Boolean(liberacao_manual),
      motivo,
      operador: actor.name,
      actor,
      scope,
    });
    res.status(201).json(resultado);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
