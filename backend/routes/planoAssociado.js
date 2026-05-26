const express = require('express');
const router = express.Router();
const VinculoService = require('../services/VinculoService');
const AuditService = require('../services/AuditService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');
const { actorWithScope, requireScope } = require('../helpers/scope');

router.get('/', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await VinculoService.listarTodos(null, scope));
  } catch (err) {
    next(err);
  }
});

router.get('/responsavel/:responsavelId/detalhe', async (req, res, next) => {
  const responsavelId = parseInt(req.params.responsavelId);
  if (!responsavelId) return res.status(400).json({ error: 'Responsavel invalido' });

  try {
    const scope = requireScope(req);
    res.json(await VinculoService.detalheResponsavel(responsavelId, null, scope));
  } catch (err) {
    next(err);
  }
});

router.get('/:responsavelId', async (req, res, next) => {
  const responsavelId = parseInt(req.params.responsavelId);
  if (!responsavelId) return res.status(400).json({ error: 'Responsavel invalido' });

  try {
    const scope = requireScope(req);
    res.json(await VinculoService.listarPorResponsavel(responsavelId, null, scope));
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission(PERMISSIONS.ALUNOS_ALTERAR_PLANO_COM_DEPENDENTES), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const vinculo = await VinculoService.criarVinculo(
      req.body || {},
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    );
    res.status(201).json(vinculo);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePermission(PERMISSIONS.ALUNOS_ALTERAR_PLANO_COM_DEPENDENTES), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await VinculoService.encerrarVinculo(
      req.params.id,
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    ));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
