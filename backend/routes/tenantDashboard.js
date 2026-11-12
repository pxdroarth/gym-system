const express = require('express');
const router = express.Router();
const TenantDashboardService = require('../services/TenantDashboardService');
const { PERMISSIONS, roleHasPermission } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');
const { requireScope } = require('../helpers/scope');

router.get('/resumo', requirePermission(PERMISSIONS.TENANT_CONSOLIDADO_VISUALIZAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const integral = roleHasPermission(req.operator.papel, PERMISSIONS.RELATORIOS_REDE_INTEGRAL);
    const unitIds = req.scope.allowedUnits
      .filter((unit) => Number(unit.tenant_id) === scope.tenant_id)
      .map((unit) => Number(unit.id));
    const data = await TenantDashboardService.resumoConsolidado(scope.tenant_id, integral ? null : unitIds);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
