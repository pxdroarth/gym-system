const AppError = require('../errors/AppError');

function requireScope(req) {
  // Token invalido, expirado ou ausente e falha de autenticacao (401), nao de
  // escopo: o frontend so renova a sessao e repete o pedido ao receber 401.
  if (req?.authError) {
    throw new AppError(req.authError.message, 401, req.authError.code);
  }
  if (!req?.operator) {
    throw new AppError('Operador nao resolvido para esta acao', 401, 'OPERADOR_NAO_RESOLVIDO');
  }
  if (req.operator.blocked) {
    throw new AppError('Operador inativo ou bloqueado nao pode executar esta acao', 403, 'OPERADOR_INATIVO_OU_BLOQUEADO');
  }
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
