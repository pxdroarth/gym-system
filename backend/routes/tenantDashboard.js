const express = require('express');
const router = express.Router();
const TenantDashboardService = require('../services/TenantDashboardService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');
const { requireScope } = require('../helpers/scope');

router.get('/resumo', requirePermission(PERMISSIONS.TENANT_CONSOLIDADO_VISUALIZAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const data = await TenantDashboardService.resumoConsolidado(scope.tenant_id);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
