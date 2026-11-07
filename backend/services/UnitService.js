const { runExecute, runGet, runQuery, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const { DEFAULT_UNIT, TENANT_STATUS, UNIT_STATUS, USER_SCOPE_STATUS } = require('../constants/scope');
const TenantService = require('./TenantService');

async function ensureDefaultUnit(client = null) {
  const db = client || { get: runGet, run: runExecute };
  const tenant = await TenantService.ensureDefaultTenant(db);

  const existing = await db.get(
    `SELECT * FROM unit
     WHERE tenant_id = ? AND codigo = ?
     LIMIT 1`,
    [tenant.id, DEFAULT_UNIT.codigo]
  );
  if (existing) return existing;

  const result = await db.run(
    `INSERT INTO unit (tenant_id, nome, codigo, status, is_matriz, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    [tenant.id, DEFAULT_UNIT.nome, DEFAULT_UNIT.codigo, UNIT_STATUS.ATIVA]
  );

  return db.get('SELECT * FROM unit WHERE id = ?', [result.lastID]);
}

// GS-03: nao existe mais vinculo automatico com a Matriz. Uma unidade so e
// valida para o usuario quando: o vinculo usuario_unit esta ativo, a unidade
// esta ativa, a Rede (tenant) esta ativa e o usuario tem vinculo ativo com a Rede.
const ALLOWED_UNITS_SELECT = `
  SELECT
    u.id,
    u.tenant_id,
    u.nome,
    u.codigo,
    u.status,
    u.is_matriz,
    uu.is_default
  FROM usuario_unit uu
  JOIN unit u ON u.id = uu.unit_id
  JOIN tenant t ON t.id = u.tenant_id
  JOIN usuario_tenant ut ON ut.usuario_id = uu.usuario_id AND ut.tenant_id = u.tenant_id
  WHERE uu.usuario_id = ?
    AND uu.status = ?
    AND u.status = ?
    AND t.status = ?
    AND ut.status = ?
`;

async function listAllowedUnits(usuarioId, client = null) {
  const db = client || { all: runQuery };
  return db.all(
    `${ALLOWED_UNITS_SELECT}
     ORDER BY uu.is_default DESC, u.nome COLLATE NOCASE`,
    [usuarioId, USER_SCOPE_STATUS.ATIVO, UNIT_STATUS.ATIVA, TENANT_STATUS.ATIVO, USER_SCOPE_STATUS.ATIVO]
  );
}

async function getDefaultUnitForUser(usuarioId) {
  const rows = await listAllowedUnits(usuarioId);
  return rows.find((unit) => Number(unit.is_default) === 1) || rows[0] || null;
}

async function getUnitForUser(usuarioId, unitId) {
  const id = Number(unitId);
  if (!id) return null;

  return runGet(
    `${ALLOWED_UNITS_SELECT}
       AND uu.unit_id = ?
     LIMIT 1`,
    [usuarioId, USER_SCOPE_STATUS.ATIVO, UNIT_STATUS.ATIVA, TENANT_STATUS.ATIVO, USER_SCOPE_STATUS.ATIVO, id]
  );
}

async function listUnitsByTenant(tenantId) {
  return runQuery(
    `SELECT * FROM unit
     WHERE tenant_id = ?
     ORDER BY is_matriz DESC, nome COLLATE NOCASE`,
    [tenantId]
  );
}

function normalizeUnitUpdate(payload = {}) {
  return {
    nome: String(payload.nome || '').trim(),
    codigo: payload.codigo ? String(payload.codigo).trim().toLowerCase() : null,
    status: String(payload.status || '').trim(),
  };
}

async function getUnitById(id) {
  const unitId = Number(id);
  if (!unitId) throw new AppError('unit_id invalido', 400, 'UNIT_ID_INVALIDO');
  const unit = await runGet(
    'SELECT id, tenant_id, nome, codigo, status, is_matriz, created_at, updated_at FROM unit WHERE id = ?',
    [unitId]
  );
  if (!unit) throw new AppError('Unidade nao encontrada', 404, 'UNIT_NAO_ENCONTRADA');
  return unit;
}

async function atualizarUnitBasica(id, payload = {}, actor) {
  const unitId = Number(id);
  const data = normalizeUnitUpdate(payload);
  if (!unitId) throw new AppError('unit_id invalido', 400, 'UNIT_ID_INVALIDO');
  if (!data.nome) throw new AppError('nome da unidade e obrigatorio', 400, 'UNIT_NOME_OBRIGATORIO');
  if (!data.codigo) throw new AppError('codigo da unidade e obrigatorio', 400, 'UNIT_CODIGO_OBRIGATORIO');
  if (!Object.values(UNIT_STATUS).includes(data.status)) throw new AppError('status da unidade invalido', 400, 'UNIT_STATUS_INVALIDO');

  return runTransaction(async (tx) => {
    const before = await tx.get('SELECT * FROM unit WHERE id = ?', [unitId]);
    if (!before) throw new AppError('Unidade nao encontrada', 404, 'UNIT_NAO_ENCONTRADA');

    const sameCode = await tx.get(
      'SELECT id FROM unit WHERE tenant_id = ? AND codigo = ? AND id <> ? LIMIT 1',
      [before.tenant_id, data.codigo, unitId]
    );
    if (sameCode) throw new AppError('Ja existe unidade com este codigo neste tenant', 409, 'UNIT_CODIGO_DUPLICADO');

    await tx.run(
      `UPDATE unit
       SET nome = ?, codigo = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [data.nome, data.codigo, data.status, unitId]
    );

    const after = await tx.get('SELECT * FROM unit WHERE id = ?', [unitId]);
    await AuditService.logAction({
      actor,
      action: 'atualizar_unit_basica',
      module: 'unit',
      recordType: 'unit',
      recordId: unitId,
      before,
      after,
      metadata: { is_matriz_editavel_nesta_sprint: false },
      tenant_id: before.tenant_id,
      unit_id: unitId,
    }, tx);

    return after;
  });
}

module.exports = {
  ensureDefaultUnit,
  listAllowedUnits,
  getDefaultUnitForUser,
  getUnitForUser,
  getUnitById,
  listUnitsByTenant,
  atualizarUnitBasica,
};
