const { runQuery, runGet, runExecute, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const UnitService = require('./UnitService');
const { USER_STATUS } = require('../constants/userRoles');
const { verifyPassword, hashToken, generateToken } = require('../utils/passwordHash');

const DEFAULT_DEV_SESSION_MINUTES = 12 * 60;
const DEFAULT_PROD_SESSION_MINUTES = 30;

function readPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getSessionTtlMinutes() {
  return (
    readPositiveNumber(process.env.AUTH_ACCESS_TOKEN_TTL_MINUTES) ||
    readPositiveNumber(process.env.AUTH_SESSION_MINUTES) ||
    (readPositiveNumber(process.env.AUTH_SESSION_HOURS) ? readPositiveNumber(process.env.AUTH_SESSION_HOURS) * 60 : null) ||
    (process.env.NODE_ENV === 'production' ? DEFAULT_PROD_SESSION_MINUTES : DEFAULT_DEV_SESSION_MINUTES)
  );
}

function sanitizeUser(user) {
  if (!user) return user;
  const { senha_hash, ...safe } = user;
  return safe;
}

function getClientInfo(req) {
  return {
    ip: req?.ip || req?.socket?.remoteAddress || null,
    user_agent: req?.headers?.['user-agent'] || null,
  };
}

function sessionExpiry() {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + getSessionTtlMinutes());
  return expires.toISOString();
}

function tokenFingerprint(token) {
  return hashToken(token).slice(0, 12);
}

async function login(payload = {}, req = null) {
  const identifier = String(payload.login || payload.email || '').trim().toLowerCase();
  const senha = payload.senha || payload.password;

  if (!identifier || !senha) {
    throw new AppError('login/email e senha sao obrigatorios', 400, 'AUTH_PAYLOAD_INVALIDO');
  }

  const user = await runGet(
    `SELECT *
     FROM usuario_interno
     WHERE LOWER(login) = ? OR LOWER(email) = ?
     LIMIT 1`,
    [identifier, identifier]
  );

  if (!user) {
    throw new AppError('Credenciais invalidas', 401, 'CREDENCIAIS_INVALIDAS');
  }

  if (user.status !== USER_STATUS.ATIVO) {
    throw new AppError('Usuario inativo ou bloqueado nao pode autenticar', 403, 'USUARIO_INATIVO_OU_BLOQUEADO');
  }

  const senhaOk = await verifyPassword(senha, user.senha_hash);
  if (!senhaOk) {
    throw new AppError('Credenciais invalidas', 401, 'CREDENCIAIS_INVALIDAS');
  }

  return runTransaction(async (tx) => {
    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = sessionExpiry();
    const client = getClientInfo(req);

    const sessionResult = await tx.run(
      `INSERT INTO auth_session
        (usuario_id, token_hash, status, expires_at, ip, user_agent, created_at, last_used_at)
       VALUES (?, ?, 'ativo', ?, ?, ?, datetime('now'), datetime('now'))`,
      [user.id, tokenHash, expiresAt, client.ip, client.user_agent]
    );

    await tx.run(
      'UPDATE usuario_interno SET ultimo_acesso_em = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?',
      [user.id]
    );

    const userScope = await UnitService.ensureUserDefaultScope(user.id, user.papel, tx);

    await AuditService.logAction({
      actor: { id: String(user.id), name: user.nome || user.login, role: user.papel },
      action: 'auth_login',
      module: 'auth',
      recordType: 'usuario_interno',
      recordId: user.id,
      before: null,
      after: sanitizeUser(user),
      metadata: { session_id: sessionResult.lastID, ip: client.ip, user_agent: client.user_agent },
      tenant_id: userScope.tenant_id,
      unit_id: userScope.unit_id,
    }, tx);

    const updatedUser = await tx.get('SELECT * FROM usuario_interno WHERE id = ?', [user.id]);
    const allowedUnits = await UnitService.listAllowedUnits(user.id);
    const currentUnit = allowedUnits.find((unit) => Number(unit.is_default) === 1) || allowedUnits[0] || null;

    return {
      token,
      expires_at: expiresAt,
      usuario: {
        ...sanitizeUser(updatedUser),
        tenant: currentUnit ? { id: currentUnit.tenant_id } : null,
        currentUnit,
        allowedUnits,
      },
    };
  });
}

async function resolveSessionToken(token) {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const row = await runGet(
    `SELECT s.*, u.nome, u.email, u.login, u.papel, u.status AS usuario_status
     FROM auth_session s
     JOIN usuario_interno u ON u.id = s.usuario_id
     WHERE s.token_hash = ?
       AND s.status = 'ativo'
       AND s.revoked_at IS NULL
       AND (s.expires_at IS NULL OR datetime(s.expires_at) > datetime('now'))
     LIMIT 1`,
    [tokenHash]
  );

  if (!row) return null;
  if (row.usuario_status !== USER_STATUS.ATIVO) return null;

  await runExecute('UPDATE auth_session SET last_used_at = datetime(\'now\') WHERE id = ?', [row.id]);
  await UnitService.ensureUserDefaultScope(row.usuario_id, row.papel);
  const allowedUnits = await UnitService.listAllowedUnits(row.usuario_id);
  const currentUnit = allowedUnits.find((unit) => Number(unit.is_default) === 1) || allowedUnits[0] || null;

  return {
    session: {
      id: row.id,
      usuario_id: row.usuario_id,
      expires_at: row.expires_at,
    },
    operator: {
      id: row.usuario_id,
      nome: row.nome,
      email: row.email,
      login: row.login,
      papel: row.papel,
      status: row.usuario_status,
      tenant_id: currentUnit?.tenant_id || null,
      unit_id: currentUnit?.id || null,
      tenant: currentUnit ? { id: currentUnit.tenant_id } : null,
      currentUnit,
      allowedUnits,
      authSource: 'auth',
    },
  };
}

async function getSessionTokenFailure(token) {
  if (!token) {
    return { code: 'TOKEN_AUSENTE', reason: 'ausente', session: null };
  }

  const tokenHash = hashToken(token);
  const session = await runGet(
    `SELECT s.*, u.nome, u.email, u.login, u.papel, u.status AS usuario_status
     FROM auth_session s
     LEFT JOIN usuario_interno u ON u.id = s.usuario_id
     WHERE s.token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );

  if (!session) {
    return { code: 'TOKEN_INVALIDO', reason: 'nao_encontrado', session: null };
  }

  if (session.status !== 'ativo' || session.revoked_at) {
    return { code: 'TOKEN_REVOGADO', reason: 'revogado', session };
  }

  if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
    return { code: 'TOKEN_EXPIRADO', reason: 'expirado', session };
  }

  if (session.usuario_status !== USER_STATUS.ATIVO) {
    return { code: 'USUARIO_INATIVO_OU_BLOQUEADO', reason: 'usuario_inativo', session };
  }

  return { code: 'TOKEN_INVALIDO', reason: 'nao_resolvido', session };
}

async function auditTokenFailure(token, req = null, failure = null) {
  const resolvedFailure = failure || await getSessionTokenFailure(token);
  const client = getClientInfo(req);
  const session = resolvedFailure.session;
  const actor = session?.usuario_id
    ? {
        id: String(session.usuario_id),
        name: session.nome || session.login || `usuario_${session.usuario_id}`,
        role: session.papel,
      }
    : { id: 'sistema', name: 'sistema' };

  await AuditService.logAction({
    actor,
    action: 'auth_token_rejected',
    module: 'auth',
    recordType: session ? 'auth_session' : 'auth_token',
    recordId: session?.id || null,
    before: null,
    after: null,
    metadata: {
      code: resolvedFailure.code,
      reason: resolvedFailure.reason,
      token_fingerprint: token ? tokenFingerprint(token) : null,
      ip: client.ip,
      user_agent: client.user_agent,
    },
    tenant_id: actor.tenant_id,
    unit_id: actor.unit_id,
  });
}

async function revokeSession(sessionId, actor, req = null, tx = null) {
  if (!sessionId) throw new AppError('Sessao ausente', 401, 'SESSAO_AUSENTE');

  const db = tx || { get: runGet, run: runExecute };
  const session = await db.get('SELECT * FROM auth_session WHERE id = ? LIMIT 1', [sessionId]);
  if (!session || session.status !== 'ativo') {
    throw new AppError('Sessao nao encontrada ou ja encerrada', 401, 'SESSAO_INVALIDA');
  }

  await db.run(
    "UPDATE auth_session SET status = 'revogado', revoked_at = datetime('now') WHERE id = ?",
    [session.id]
  );

  await AuditService.logAction({
    actor,
    action: 'auth_logout',
    module: 'auth',
    recordType: 'auth_session',
    recordId: session.id,
    before: session,
    after: { ...session, status: 'revogado' },
    metadata: getClientInfo(req),
    tenant_id: actor?.tenant_id,
    unit_id: actor?.unit_id,
  }, tx);

  return { ok: true };
}

async function revokeCurrentSession(token, actor, req = null, tx = null) {
  if (!token) throw new AppError('Token ausente', 401, 'TOKEN_AUSENTE');

  const tokenHash = hashToken(token);
  const session = tx
    ? await tx.get('SELECT * FROM auth_session WHERE token_hash = ? LIMIT 1', [tokenHash])
    : await runGet('SELECT * FROM auth_session WHERE token_hash = ? LIMIT 1', [tokenHash]);

  return revokeSession(session?.id, actor, req, tx);
}

async function revokeActiveSessionsForUser(userId, actor, options = {}, tx = null) {
  const usuarioId = Number(userId);
  if (!usuarioId) throw new AppError('usuario_id invalido', 400, 'USUARIO_ID_INVALIDO');

  const db = tx || { all: runQuery, run: runExecute };
  const sessions = await db.all(
    `SELECT id
     FROM auth_session
     WHERE usuario_id = ?
       AND status = 'ativo'
       AND revoked_at IS NULL`,
    [usuarioId]
  );
  const sessionIds = sessions.map((session) => session.id);

  if (sessionIds.length) {
    const placeholders = sessionIds.map(() => '?').join(', ');
    await db.run(
      `UPDATE auth_session
       SET status = 'revogado', revoked_at = datetime('now')
       WHERE id IN (${placeholders})`,
      sessionIds
    );
  }

  const client = getClientInfo(options.req);
  await AuditService.logAction({
    actor,
    action: options.action || 'auth_sessions_revoked',
    module: 'auth',
    recordType: 'usuario_interno',
    recordId: usuarioId,
    before: null,
    after: { revoked_count: sessionIds.length },
    metadata: {
      affected_user_id: usuarioId,
      revoked_session_ids: sessionIds,
      revoked_count: sessionIds.length,
      reason: options.reason || null,
      ip: client.ip,
      user_agent: client.user_agent,
      ...options.metadata,
    },
    tenant_id: actor?.tenant_id,
    unit_id: actor?.unit_id,
  }, tx);

  return {
    ok: true,
    revoked_count: sessionIds.length,
    revoked_session_ids: sessionIds,
  };
}

async function logoutAll(actor, req = null) {
  if (!actor?.id) throw new AppError('Operador nao autenticado', 401, 'OPERADOR_NAO_AUTENTICADO');

  return runTransaction(async (tx) => revokeActiveSessionsForUser(
    actor.id,
    actor,
    {
      action: 'auth_logout_all',
      reason: 'usuario_solicitou_logout_all',
      req,
    },
    tx
  ));
}

async function logout(token, actor, req = null) {
  if (!token) throw new AppError('Token ausente', 401, 'TOKEN_AUSENTE');

  return runTransaction(async (tx) => {
    return revokeCurrentSession(token, actor, req, tx);
  });
}

function extractBearerToken(req) {
  const authHeader = req?.headers?.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  return match ? match[1].trim() : null;
}

module.exports = {
  login,
  logout,
  resolveSessionToken,
  getSessionTtlMinutes,
  getSessionTokenFailure,
  auditTokenFailure,
  revokeSession,
  revokeCurrentSession,
  revokeActiveSessionsForUser,
  logoutAll,
  extractBearerToken,
  sanitizeUser,
};
