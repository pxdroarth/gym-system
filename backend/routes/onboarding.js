const express = require('express');
const router = express.Router();
const OnboardingService = require('../services/OnboardingService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');

router.post('/tenants', requirePermission(PERMISSIONS.PLATFORM_ONBOARDING_EXECUTAR), async (req, res, next) => {
  try {
    const data = await OnboardingService.prepararTenantInicial(req.body || {}, req.operator);
    res.status(201).json({
      ok: true,
      data,
      message: 'Onboarding interno preparado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
