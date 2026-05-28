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
    const scope = requireScope(req);
    if (req.body?.liberacao_manual) {
      // Liberacao manual e excecao operacional auditada para override de um
      // bloqueio real; nao substitui a avaliacao normal de acesso.
      assertPermission(req, PERMISSIONS.ACESSO_LIBERACAO_MANUAL);
      const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
      const resultado = await AccessService.registrarTentativaAcesso(req.body.aluno_id, {
        liberacaoManual: true,
        motivo: req.body.motivo,
        operador: actor.name,
        actor,
        scope,
      });
      return res.status(201).json(resultado);
    }

    const resultado = await AccessService.registrarTentativaAcesso(req.body?.aluno_id, { scope });
    res.status(201).json(resultado);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);

  if (isNaN(id) || id <= 0) {
    return next(new AppError('ID de acesso invalido', 400, 'ACESSO_ID_INVALIDO'));
  }

  return next(new AppError(
    'Registro de acesso e log operacional sensivel; alteracao direta nao permitida. Use liberacao_manual auditada para excecoes.',
    403,
    'ACESSO_REGISTRO_IMUTAVEL'
  ));
});

router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);

  if (isNaN(id) || id <= 0) {
    return next(new AppError('ID de acesso invalido', 400, 'ACESSO_ID_INVALIDO'));
  }

  return next(new AppError(
    'Registro de acesso e log operacional sensivel; exclusao direta nao permitida.',
    403,
    'ACESSO_REGISTRO_IMUTAVEL'
  ));
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
      // O mock preserva o mesmo contrato de seguranca da liberacao manual real
      // para nao criar caminho "de teste" mais permissivo do que producao.
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
