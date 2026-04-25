const AppError = require('../errors/AppError');

function requireScope(req) {
  const scope = req?.scope;
  if (!scope?.tenant_id || !scope?.unit_id) {
    throw new AppError('Escopo de tenant/unidade nao resolvido', 403, 'SCOPE_NOT_RESOLVED');
  }
  return {
    tenant_id: Number(scope.tenant_id),
    unit_id: Number(scope.unit_id),
  };
}

function actorWithScope(actor, scope) {
  return {
    ...(actor || {}),
    tenant_id: scope?.tenant_id || actor?.tenant_id || null,
    unit_id: scope?.unit_id || actor?.unit_id || null,
  };
}

module.exports = {
  requireScope,
  actorWithScope,
};
