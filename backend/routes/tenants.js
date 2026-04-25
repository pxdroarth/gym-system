const express = require('express');
const router = express.Router();
const TenantService = require('../services/TenantService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');

router.get('/', requirePermission(PERMISSIONS.LOGS_VISUALIZAR_TOTAL), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await TenantService.listTenants() });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requirePermission(PERMISSIONS.PLATFORM_TENANT_CONFIGURAR), async (req, res, next) => {
  try {
    res.json({ ok: true, data: await TenantService.getTenantById(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requirePermission(PERMISSIONS.PLATFORM_TENANT_CONFIGURAR), async (req, res, next) => {
  try {
    const tenant = await TenantService.atualizarTenantBasico(req.params.id, req.body || {}, req.operator);
    res.json({ ok: true, data: tenant, message: 'Tenant atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
