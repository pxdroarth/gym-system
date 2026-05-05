const { runQuery, runGet, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const AuthService = require('./AuthService');
const UnitService = require('./UnitService');
const { USER_ROLES, USER_STATUS, isValidRole, isValidStatus } = require('../constants/userRoles');
const { hashPassword } = require('../utils/passwordHash');

function normalizeUserPayload(payload = {}) {
  return {
    nome: String(payload.nome || '').trim(),
    email: payload.email ? String(payload.email).trim().toLowerCase() : null,
    login: payload.login ? String(payload.login).trim().toLowerCase() : null,
    papel: String(payload.papel || USER_ROLES.RECEPCAO).trim(),
    status: String(payload.status || USER_STATUS.ATIVO).trim(),
    senha: payload.senha || payload.password || null,
  };
}

function sanitizeUser(user) {
  if (!user) return user;
  const { senha_hash, ...safe } = user;
  return safe;
}

function assertCanManageRole(actor, role) {
  if (role === USER_ROLES.PLATFORM_ADMIN && actor?.papel !== USER_ROLES.PLATFORM_ADMIN) {
    throw new AppError(
      'Apenas platform_admin pode criar ou promover usuarios de plataforma',
      403,
      'PLATFORM_ADMIN_RESTRITO'
    );
  }
}

async function listarUsuarios() {
  const rows = await runQuery(`
    SELECT id, nome, email, login, papel, status, ultimo_acesso_em, created_at, updated_at, created_by, updated_by
    FROM usuario_interno
    ORDER BY nome COLLATE NOCASE
  `);
  return rows;
}

async function criarUsuario(payload = {}, actor) {
  const data = normalizeUserPayload(payload);
  if (!data.nome) throw new AppError('nome e obrigatorio', 400, 'USUARIO_NOME_OBRIGATORIO');
  if (!data.login && !data.email) throw new AppError('login ou email e obrigatorio', 400, 'USUARIO_IDENTIFICADOR_OBRIGATORIO');
  if (!isValidRole(data.papel)) throw new AppError('papel invalido', 400, 'USUARIO_PAPEL_INVALIDO');
  if (!isValidStatus(data.status)) throw new AppError('status invalido', 400, 'USUARIO_STATUS_INVALIDO');
  if (!data.senha) throw new AppError('senha inicial e obrigatoria', 400, 'USUARIO_SENHA_OBRIGATORIA');
  assertCanManageRole(actor, data.papel);

  const senhaHash = await hashPassword(data.senha);

  return runTransaction(async (tx) => {
    const result = await tx.run(
      `INSERT INTO usuario_interno
        (nome, email, login, papel, status, senha_hash, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        data.nome,
        data.email,
        data.login,
        data.papel,
        data.status,
        senhaHash,
        actor?.id || 'sistema',
        actor?.id || 'sistema',
      ]
    );

    const user = await tx.get('SELECT * FROM usuario_interno WHERE id = ?', [result.lastID]);
    const userScope = await UnitService.ensureUserDefaultScope(result.lastID, data.papel, tx);
    await AuditService.logAction({
      actor,
      action: 'criar_usuario_interno',
      module: 'usuarios_internos',
      recordType: 'usuario_interno',
      recordId: result.lastID,
      before: null,
      after: sanitizeUser(user),
      metadata: {
        criou_admin: data.papel === USER_ROLES.ADMIN,
        preparado_para_restringir_admin: true,
      },
      tenant_id: actor?.tenant_id || userScope.tenant_id,
      unit_id: actor?.unit_id || userScope.unit_id,
    }, tx);

    return sanitizeUser(user);
  });
}

async function alterarPapel(id, papel, actor) {
  const userId = Number(id);
  if (!userId) throw new AppError('usuario_id invalido', 400, 'USUARIO_ID_INVALIDO');
  if (!isValidRole(papel)) throw new AppError('papel invalido', 400, 'USUARIO_PAPEL_INVALIDO');
  assertCanManageRole(actor, papel);

  return runTransaction(async (tx) => {
    const before = await tx.get('SELECT * FROM usuario_interno WHERE id = ?', [userId]);
    if (!before) throw new AppError('Usuario nao encontrado', 404, 'USUARIO_NAO_ENCONTRADO');

    await tx.run(
      'UPDATE usuario_interno SET papel = ?, updated_by = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [papel, actor?.id || 'sistema', userId]
    );

    const after = await tx.get('SELECT * FROM usuario_interno WHERE id = ?', [userId]);
    await AuditService.logAction({
      actor,
      action: 'alterar_papel_usuario',
      module: 'usuarios_internos',
      recordType: 'usuario_interno',
      recordId: userId,
      before: sanitizeUser(before),
      after: sanitizeUser(after),
      metadata: {
        promoveu_admin: papel === USER_ROLES.ADMIN && before.papel !== USER_ROLES.ADMIN,
        preparado_para_restringir_admin: true,
      },
      tenant_id: actor?.tenant_id,
      unit_id: actor?.unit_id,
    }, tx);

    if (before.papel !== after.papel) {
      await AuthService.revokeActiveSessionsForUser(userId, actor, {
        action: 'auth_sessions_revoked_by_role_change',
        reason: 'alteracao_de_papel',
        metadata: {
          affected_user_id: userId,
          before_role: before.papel,
          after_role: after.papel,
        },
      }, tx);
    }

    return sanitizeUser(after);
  });
}

async function alterarStatus(id, status, actor) {
  const userId = Number(id);
  if (!userId) throw new AppError('usuario_id invalido', 400, 'USUARIO_ID_INVALIDO');
  if (!isValidStatus(status)) throw new AppError('status invalido', 400, 'USUARIO_STATUS_INVALIDO');

  return runTransaction(async (tx) => {
    const before = await tx.get('SELECT * FROM usuario_interno WHERE id = ?', [userId]);
    if (!before) throw new AppError('Usuario nao encontrado', 404, 'USUARIO_NAO_ENCONTRADO');

    await tx.run(
      'UPDATE usuario_interno SET status = ?, updated_by = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [status, actor?.id || 'sistema', userId]
    );

    const after = await tx.get('SELECT * FROM usuario_interno WHERE id = ?', [userId]);
    await AuditService.logAction({
      actor,
      action: 'alterar_status_usuario',
      module: 'usuarios_internos',
      recordType: 'usuario_interno',
      recordId: userId,
      before: sanitizeUser(before),
      after: sanitizeUser(after),
      tenant_id: actor?.tenant_id,
      unit_id: actor?.unit_id,
    }, tx);

    if (before.status !== after.status) {
      await AuthService.revokeActiveSessionsForUser(userId, actor, {
        action: 'auth_sessions_revoked_by_status_change',
        reason: 'alteracao_de_status',
        metadata: {
          affected_user_id: userId,
          before_status: before.status,
          after_status: after.status,
        },
      }, tx);
    }

    return sanitizeUser(after);
  });
}

module.exports = {
  listarUsuarios,
  criarUsuario,
  alterarPapel,
  alterarStatus,
  sanitizeUser,
};
