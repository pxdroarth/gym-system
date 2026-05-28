const AppError = require('../errors/AppError');
const { roleHasPermission, USER_STATUS } = require('../constants/userRoles');

function assertActiveOperator(req) {
  // A validacao de permissao parte de um operador autenticado e ativo.
  // Nao basta "ter o papel": sessao invalida, operador inativo ou bloqueado
  // devem falhar antes de qualquer check nominal de permissao.
  if (req?.authError) {
    throw new AppError(req.authError.message, 401, req.authError.code);
  }

  if (!req?.operator) {
    throw new AppError('Operador nao resolvido para esta acao', 401, 'OPERADOR_NAO_RESOLVIDO');
  }

  if (req.operator.status !== USER_STATUS.ATIVO || req.operator.blocked) {
    throw new AppError('Operador inativo ou bloqueado nao pode executar esta acao', 403, 'OPERADOR_INATIVO_OU_BLOQUEADO');
  }

  return req.operator;
}

function assertPermission(req, permission) {
  const operator = assertActiveOperator(req);
  if (!roleHasPermission(operator.papel, permission)) {
    throw new AppError('Permissao negada para esta acao', 403, 'PERMISSAO_NEGADA', {
      permission,
      papel: operator.papel,
    });
  }
  return operator;
}

function requirePermission(permission) {
  return (req, _res, next) => {
    try {
      assertPermission(req, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requirePermission,
  assertActiveOperator,
  assertPermission,
};
