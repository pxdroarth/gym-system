const { runGet, runExecute, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const UnitService = require('./UnitService');
const { USER_STATUS } = require('../constants/userRoles');
const { verifyPassword, hashToken, generateToken } = require('../utils/passwordHash');

const DEFAULT_SESSION_HOURS = Number(process.env.AUTH_SESSION_HOURS || 12);

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
  expires.setHours(expires.getHours() + DEFAULT_SESSION_HOURS);
  return expires.toISOString();
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

async function logout(token, actor, req = null) {
  if (!token) throw new AppError('Token ausente', 401, 'TOKEN_AUSENTE');

  const tokenHash = hashToken(token);
  const session = await runGet('SELECT * FROM auth_session WHERE token_hash = ? LIMIT 1', [tokenHash]);
  if (!session || session.status !== 'ativo') {
    throw new AppError('Sessao nao encontrada ou ja encerrada', 401, 'SESSAO_INVALIDA');
  }

  return runTransaction(async (tx) => {
    await tx.run(
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
  extractBearerToken,
  sanitizeUser,
};
