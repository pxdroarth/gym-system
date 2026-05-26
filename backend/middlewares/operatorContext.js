const { runGet } = require('../dbHelper');
const { USER_STATUS } = require('../constants/userRoles');
const AuthService = require('../services/AuthService');

// Fallback legado para local/teste; nao deve ficar aberto por padrao fora desses ambientes.
function isLegacyOperatorHeaderFallbackAllowed() {
  return process.env.NODE_ENV === 'test' || String(process.env.ALLOW_LEGACY_OPERATOR_HEADERS || '').trim().toLowerCase() === 'true';
}

function getLegacyOperatorHeaderId(req) {
  return req.headers?.['x-operator-id'] || req.headers?.['x-user-id'] || null;
}

async function resolveLegacyOperator(req) {
  const operatorId = getLegacyOperatorHeaderId(req);
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
        await AuthService.auditTokenFailure(null, req, {
          code: 'TOKEN_FORMATO_INVALIDO',
          reason: 'bearer_malformado',
          session: null,
        });
        req.authError = { message: 'Authorization Bearer invalido', code: 'TOKEN_FORMATO_INVALIDO' };
        return next();
      }

      const resolved = await AuthService.resolveSessionToken(token);
      if (!resolved) {
        const failure = await AuthService.getSessionTokenFailure(token);
        await AuthService.auditTokenFailure(token, req, failure);
        req.authError = { message: 'Token invalido ou expirado', code: failure.code };
        return next();
      }

      req.operator = resolved.operator;
      req.authSession = resolved.session;
      return next();
    }

    const legacyOperatorId = getLegacyOperatorHeaderId(req);
    if (legacyOperatorId && !isLegacyOperatorHeaderFallbackAllowed()) {
      req.authError = {
        message: 'Headers legados de operador nao sao permitidos neste ambiente',
        code: 'LEGACY_OPERATOR_HEADERS_DISABLED',
      };
      return next();
    }

    req.operator = await resolveLegacyOperator(req);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = operatorContext;
