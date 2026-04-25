const express = require('express');
const router = express.Router();
const UnitService = require('../services/UnitService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');

router.get('/me', async (req, res, next) => {
  try {
    if (!req.operator || req.operator.blocked) {
      return res.status(401).json({
        ok: false,
        error: 'Operador nao autenticado',
        code: 'OPERADOR_NAO_AUTENTICADO',
      });
    }

    res.json({
      ok: true,
      data: {
        currentUnit: req.scope?.currentUnit || null,
        allowedUnits: await UnitService.listAllowedUnits(req.operator.id),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/tenant/:tenantId', requirePermission(PERMISSIONS.PLATFORM_TENANT_CONFIGURAR), async (req, res, next) => {
  try {
    res.json({ ok: true, data: await UnitService.listUnitsByTenant(req.params.tenantId) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requirePermission(PERMISSIONS.PLATFORM_TENANT_CONFIGURAR), async (req, res, next) => {
  try {
    const unit = await UnitService.atualizarUnitBasica(req.params.id, req.body || {}, req.operator);
    res.json({ ok: true, data: unit, message: 'Unidade atualizada com sucesso' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
