const { runExecute, runGet, runQuery, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const { DEFAULT_TENANT, TENANT_STATUS } = require('../constants/scope');

async function getDefaultTenant(client = null) {
  const db = client || { get: runGet };
  return db.get(
    `SELECT * FROM tenant
     WHERE documento = ?
     LIMIT 1`,
    [DEFAULT_TENANT.documento]
  );
}

async function ensureDefaultTenant(client = null) {
  const db = client || { get: runGet, run: runExecute };
  const existing = await getDefaultTenant(db);
  if (existing) return existing;

  const result = await db.run(
    `INSERT INTO tenant (nome, documento, status, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [DEFAULT_TENANT.nome, DEFAULT_TENANT.documento, TENANT_STATUS.ATIVO]
  );

  return db.get('SELECT * FROM tenant WHERE id = ?', [result.lastID]);
}

async function listTenants() {
  return runQuery('SELECT * FROM tenant ORDER BY nome COLLATE NOCASE');
}

function normalizeTenantUpdate(payload = {}) {
  return {
    nome: String(payload.nome || '').trim(),
    documento: payload.documento ? String(payload.documento).trim() : null,
    status: String(payload.status || '').trim(),
    plano_comercial: payload.plano_comercial ? String(payload.plano_comercial).trim() : null,
    onboarding_status: payload.onboarding_status ? String(payload.onboarding_status).trim() : null,
  };
}

async function getTenantById(id) {
  const tenantId = Number(id);
  if (!tenantId) throw new AppError('tenant_id invalido', 400, 'TENANT_ID_INVALIDO');
  const tenant = await runGet(
    'SELECT id, nome, documento, status, plano_comercial, onboarding_status, created_at, updated_at FROM tenant WHERE id = ?',
    [tenantId]
  );
  if (!tenant) throw new AppError('Tenant nao encontrado', 404, 'TENANT_NAO_ENCONTRADO');
  return tenant;
}

async function atualizarTenantBasico(id, payload = {}, actor) {
  const tenantId = Number(id);
  const data = normalizeTenantUpdate(payload);
  if (!tenantId) throw new AppError('tenant_id invalido', 400, 'TENANT_ID_INVALIDO');
  if (!data.nome) throw new AppError('nome do tenant e obrigatorio', 400, 'TENANT_NOME_OBRIGATORIO');
  if (!Object.values(TENANT_STATUS).includes(data.status)) throw new AppError('status do tenant invalido', 400, 'TENANT_STATUS_INVALIDO');

  return runTransaction(async (tx) => {
    const before = await tx.get('SELECT * FROM tenant WHERE id = ?', [tenantId]);
    if (!before) throw new AppError('Tenant nao encontrado', 404, 'TENANT_NAO_ENCONTRADO');

    if (data.documento) {
      const sameDocument = await tx.get('SELECT id FROM tenant WHERE documento = ? AND id <> ? LIMIT 1', [data.documento, tenantId]);
      if (sameDocument) throw new AppError('Ja existe tenant com este documento', 409, 'TENANT_DOCUMENTO_DUPLICADO');
    }

    await tx.run(
      `UPDATE tenant
       SET nome = ?, documento = ?, status = ?, plano_comercial = ?, onboarding_status = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [data.nome, data.documento, data.status, data.plano_comercial, data.onboarding_status, tenantId]
    );

    const after = await tx.get('SELECT * FROM tenant WHERE id = ?', [tenantId]);
    await AuditService.logAction({
      actor,
      action: 'atualizar_tenant_basico',
      module: 'tenant',
      recordType: 'tenant',
      recordId: tenantId,
      before,
      after,
      tenant_id: tenantId,
      unit_id: actor?.unit_id,
    }, tx);

    return after;
  });
}

module.exports = {
  ensureDefaultTenant,
  getDefaultTenant,
  getTenantById,
  listTenants,
  atualizarTenantBasico,
};
