const { runGet } = require('../dbHelper');
const { USER_STATUS } = require('../constants/userRoles');
const AuthService = require('../services/AuthService');

async function resolveLegacyOperator(req) {
  const operatorId = req.headers?.['x-operator-id'] || req.headers?.['x-user-id'];
  if (!operatorId) return null;

  const user = await runGet(
    `SELECT id, nome, email, login, papel, status
     FROM usuario_interno
     WHERE id = ?`,
    [operatorId]
  );

  if (!user) return null;
  if (user.status !== USER_STATUS.ATIVO) {
    return { ...user, blocked: true, authSource: 'header_legacy' };
  }

  return { ...user, authSource: 'header_legacy' };
}

async function operatorContext(req, _res, next) {
  try {
    req.operator = null;
    req.authSession = null;
    req.authError = null;

    const authHeader = req.headers?.authorization;
    if (authHeader) {
      const token = AuthService.extractBearerToken(req);
      if (!token) {
        req.authError = { message: 'Authorization Bearer invalido', code: 'TOKEN_FORMATO_INVALIDO' };
        return next();
      }

      const resolved = await AuthService.resolveSessionToken(token);
      if (!resolved) {
        req.authError = { message: 'Token invalido ou expirado', code: 'TOKEN_INVALIDO' };
        return next();
      }

      req.operator = resolved.operator;
      req.authSession = resolved.session;
      return next();
    }

    req.operator = await resolveLegacyOperator(req);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = operatorContext;
