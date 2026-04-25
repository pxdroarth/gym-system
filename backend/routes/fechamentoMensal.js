const express = require('express');
const router = express.Router();
const FechamentoMensalService = require('../services/FechamentoMensalService');
const AuditService = require('../services/AuditService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');
const { actorWithScope, requireScope } = require('../helpers/scope');

router.get('/:ano/:mes/analisar', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await FechamentoMensalService.analisarPeriodo(req.params.ano, req.params.mes, null, scope));
  } catch (error) {
    next(error);
  }
});

router.post('/:ano/:mes/fechar', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await FechamentoMensalService.fecharPeriodo(
      req.params.ano,
      req.params.mes,
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    ));
  } catch (error) {
    next(error);
  }
});

router.post('/:ano/:mes/reabrir', requirePermission(PERMISSIONS.FECHAMENTO_REABRIR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await FechamentoMensalService.reabrirPeriodo(
      req.params.ano,
      req.params.mes,
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    ));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
