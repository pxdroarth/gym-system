const { runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const { TENANT_STATUS, UNIT_STATUS, USER_SCOPE_STATUS } = require('../constants/scope');
const { USER_ROLES, USER_STATUS } = require('../constants/userRoles');
const { hashPassword } = require('../utils/passwordHash');

function normalizePayload(payload = {}) {
  return {
    tenant_nome: String(payload.tenant_nome || '').trim(),
    tenant_documento: payload.tenant_documento ? String(payload.tenant_documento).trim() : null,
    tenant_status: String(payload.tenant_status || TENANT_STATUS.ATIVO).trim(),
    plano_comercial: payload.plano_comercial ? String(payload.plano_comercial).trim() : null,
    onboarding_status: String(payload.onboarding_status || 'preparado').trim(),
    unit_nome: String(payload.unit_nome || 'Unidade Matriz').trim(),
    unit_codigo: String(payload.unit_codigo || 'matriz').trim().toLowerCase(),
    unit_status: String(payload.unit_status || UNIT_STATUS.ATIVA).trim(),
    admin_nome: String(payload.admin_nome || '').trim(),
    admin_email: payload.admin_email ? String(payload.admin_email).trim().toLowerCase() : null,
    admin_login: payload.admin_login ? String(payload.admin_login).trim().toLowerCase() : null,
    admin_senha: payload.admin_senha || payload.senha || null,
  };
}

async function prepararTenantInicial(payload = {}, actor = null) {
  const data = normalizePayload(payload);
  if (!data.tenant_nome) throw new AppError('tenant_nome e obrigatorio', 400, 'TENANT_NOME_OBRIGATORIO');
  if (!data.admin_nome) throw new AppError('admin_nome e obrigatorio', 400, 'ADMIN_NOME_OBRIGATORIO');
  if (!data.admin_login && !data.admin_email) throw new AppError('admin_login ou admin_email e obrigatorio', 400, 'ADMIN_IDENTIFICADOR_OBRIGATORIO');
  if (!data.admin_senha) throw new AppError('admin_senha e obrigatoria', 400, 'ADMIN_SENHA_OBRIGATORIA');
  if (!Object.values(TENANT_STATUS).includes(data.tenant_status)) throw new AppError('tenant_status invalido', 400, 'TENANT_STATUS_INVALIDO');
  if (!Object.values(UNIT_STATUS).includes(data.unit_status)) throw new AppError('unit_status invalido', 400, 'UNIT_STATUS_INVALIDO');

  return runTransaction(async (tx) => {
    if (data.tenant_documento) {
      const sameDocument = await tx.get('SELECT id FROM tenant WHERE documento = ? LIMIT 1', [data.tenant_documento]);
      if (sameDocument) throw new AppError('Ja existe tenant com este documento', 409, 'TENANT_DOCUMENTO_DUPLICADO');
    }

    if (data.admin_login) {
      const sameLogin = await tx.get('SELECT id FROM usuario_interno WHERE login = ? LIMIT 1', [data.admin_login]);
      if (sameLogin) throw new AppError('Ja existe usuario com este login', 409, 'USUARIO_LOGIN_DUPLICADO');
    }

    if (data.admin_email) {
      const sameEmail = await tx.get('SELECT id FROM usuario_interno WHERE email = ? LIMIT 1', [data.admin_email]);
      if (sameEmail) throw new AppError('Ja existe usuario com este email', 409, 'USUARIO_EMAIL_DUPLICADO');
    }

    const tenantResult = await tx.run(
      `INSERT INTO tenant (nome, documento, status, plano_comercial, onboarding_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [data.tenant_nome, data.tenant_documento, data.tenant_status, data.plano_comercial, data.onboarding_status]
    );

    const unitResult = await tx.run(
      `INSERT INTO unit (tenant_id, nome, codigo, status, is_matriz, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
      [tenantResult.lastID, data.unit_nome, data.unit_codigo, data.unit_status]
    );

    const userResult = await tx.run(
      `INSERT INTO usuario_interno
        (nome, email, login, papel, status, senha_hash, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        data.admin_nome,
        data.admin_email,
        data.admin_login,
        USER_ROLES.OWNER,
        USER_STATUS.ATIVO,
        await hashPassword(data.admin_senha),
        actor?.id || 'onboarding_interno',
        actor?.id || 'onboarding_interno',
      ]
    );

    await tx.run(
      `INSERT INTO usuario_tenant (usuario_id, tenant_id, papel_no_tenant, status, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [userResult.lastID, tenantResult.lastID, USER_ROLES.OWNER, USER_SCOPE_STATUS.ATIVO]
    );

    await tx.run(
      `INSERT INTO usuario_unit (usuario_id, unit_id, is_default, status, created_at)
       VALUES (?, ?, 1, ?, datetime('now'))`,
      [userResult.lastID, unitResult.lastID, USER_SCOPE_STATUS.ATIVO]
    );

    await AuditService.logAction({
      actor,
      action: 'preparar_tenant_onboarding_minimo',
      module: 'onboarding',
      recordType: 'tenant',
      recordId: tenantResult.lastID,
      before: null,
      after: {
        tenant_id: tenantResult.lastID,
        unit_id: unitResult.lastID,
        owner_id: userResult.lastID,
      },
      metadata: { self_service: false },
      tenant_id: tenantResult.lastID,
      unit_id: unitResult.lastID,
    }, tx);

    return {
      tenant: await tx.get('SELECT id, nome, documento, status, plano_comercial, onboarding_status, created_at, updated_at FROM tenant WHERE id = ?', [tenantResult.lastID]),
      unit: await tx.get('SELECT id, tenant_id, nome, codigo, status, is_matriz, created_at, updated_at FROM unit WHERE id = ?', [unitResult.lastID]),
      owner: {
        id: userResult.lastID,
        nome: data.admin_nome,
        email: data.admin_email,
        login: data.admin_login,
        papel: USER_ROLES.OWNER,
        status: USER_STATUS.ATIVO,
      },
    };
  });
}

module.exports = {
  prepararTenantInicial,
};
