const AppError = require('../errors/AppError');
const UnitService = require('../services/UnitService');

async function scopeContext(req, _res, next) {
  try {
    req.scope = null;

    if (!req.operator || req.operator.blocked) {
      return next();
    }

    const requestedUnitId = req.headers?.['x-unit-id'] || req.query?.unit_id || null;
    const unit = requestedUnitId
      ? await UnitService.getUnitForUser(req.operator.id, requestedUnitId)
      : await UnitService.getDefaultUnitForUser(req.operator.id);

    if (!unit) {
      return next(new AppError(
        requestedUnitId
          ? 'Unidade informada nao esta disponivel para este usuario'
          : 'Usuario nao possui unidade operacional valida',
        403,
        requestedUnitId ? 'UNIT_FORBIDDEN' : 'UNIT_SCOPE_NOT_FOUND'
      ));
    }

    const allowedUnits = await UnitService.listAllowedUnits(req.operator.id);
    req.scope = {
      tenant_id: unit.tenant_id,
      unit_id: unit.id,
      currentUnit: unit,
      allowedUnits,
      isConsolidated: false,
    };

    req.operator.tenant_id = unit.tenant_id;
    req.operator.unit_id = unit.id;
    req.operator.tenant = { id: unit.tenant_id };
    req.operator.currentUnit = unit;
    req.operator.allowedUnits = allowedUnits;

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = scopeContext;
