const { runGet, runQuery } = require('../dbHelper');
const AppError = require('../errors/AppError');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInteger(value, fieldName, code) {
  if (!/^\d+$/.test(String(value || ''))) {
    throw new AppError(`${fieldName} invalido`, 400, code);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AppError(`${fieldName} invalido`, 400, code);
  }

  return parsed;
}

function normalizePagination(query = {}) {
  const pagina = query.pagina
    ? parsePositiveInteger(query.pagina, 'Pagina', 'PAGINA_INVALIDA')
    : DEFAULT_PAGE;
  const requestedLimit = query.limite
    ? parsePositiveInteger(query.limite, 'Limite', 'LIMITE_INVALIDO')
    : DEFAULT_LIMIT;
  const limite = Math.min(requestedLimit, MAX_LIMIT);
  const offset = (pagina - 1) * limite;

  return { pagina, limite, offset };
}

function appendTextFilter(where, params, column, value) {
  const normalized = String(value || '').trim();
  if (!normalized) return;

  where.push(`${column} = ?`);
  params.push(normalized);
}

async function listarDispositivos({ scope, query = {} }) {
  const { pagina, limite, offset } = normalizePagination(query);
  const where = [
    'tenant_id = ?',
    'unit_id = ?',
    'deleted_at IS NULL',
  ];
  const params = [scope.tenant_id, scope.unit_id];

  appendTextFilter(where, params, 'status', query.status);
  appendTextFilter(where, params, 'provider', query.provider);
  appendTextFilter(where, params, 'tipo', query.tipo);

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const rows = await runQuery(`
    SELECT id, nome, provider, tipo, status, last_seen_at, created_at, updated_at
    FROM access_devices
    ${whereSql}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ? OFFSET ?
  `, [...params, limite, offset]);

  const countRow = await runGet(`
    SELECT COUNT(*) AS total
    FROM access_devices
    ${whereSql}
  `, params);

  return {
    rows,
    total: countRow?.total || 0,
    pagina,
    limite,
  };
}

async function buscarDispositivoPorId(id, { scope }) {
  const deviceId = parsePositiveInteger(id, 'Dispositivo', 'ACCESS_DEVICE_ID_INVALIDO');
  const row = await runGet(`
    SELECT id, nome, provider, tipo, status, last_seen_at, created_at, updated_at
    FROM access_devices
    WHERE id = ?
      AND tenant_id = ?
      AND unit_id = ?
      AND deleted_at IS NULL
  `, [deviceId, scope.tenant_id, scope.unit_id]);

  if (!row) {
    throw new AppError(
      'Dispositivo de acesso nao encontrado',
      404,
      'ACCESS_DEVICE_NAO_ENCONTRADO'
    );
  }

  return row;
}

async function assertAlunoNoEscopo(alunoId, scope) {
  const row = await runGet(`
    SELECT id
    FROM aluno
    WHERE id = ?
      AND tenant_id = ?
      AND unit_id = ?
  `, [alunoId, scope.tenant_id, scope.unit_id]);

  if (!row) {
    throw new AppError('Aluno nao encontrado', 404, 'ALUNO_NAO_ENCONTRADO');
  }
}

async function listarCredenciais({ scope, query = {}, alunoId = null }) {
  const { pagina, limite, offset } = normalizePagination(query);
  const where = [
    'c.tenant_id = ?',
    'c.unit_id = ?',
    'c.deleted_at IS NULL',
  ];
  const params = [scope.tenant_id, scope.unit_id];

  const resolvedAlunoId = alunoId || query.aluno_id;
  if (resolvedAlunoId) {
    const parsedAlunoId = parsePositiveInteger(
      resolvedAlunoId,
      'Aluno',
      'ALUNO_ID_INVALIDO'
    );
    await assertAlunoNoEscopo(parsedAlunoId, scope);
    where.push('c.aluno_id = ?');
    params.push(parsedAlunoId);
  }

  appendTextFilter(where, params, 'c.status', query.status);
  appendTextFilter(where, params, 'c.provider', query.provider);
  appendTextFilter(where, params, 'c.tipo', query.tipo);

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const rows = await runQuery(`
    SELECT
      c.id,
      c.aluno_id,
      a.nome AS aluno_nome,
      c.tipo,
      c.provider,
      c.status,
      c.enrolled_at,
      c.revoked_at,
      c.created_at,
      c.updated_at
    FROM access_credentials c
    LEFT JOIN aluno a
      ON a.id = c.aluno_id
      AND a.tenant_id = c.tenant_id
      AND a.unit_id = c.unit_id
    ${whereSql}
    ORDER BY datetime(c.created_at) DESC, c.id DESC
    LIMIT ? OFFSET ?
  `, [...params, limite, offset]);

  const countRow = await runGet(`
    SELECT COUNT(*) AS total
    FROM access_credentials c
    ${whereSql}
  `, params);

  return {
    rows,
    total: countRow?.total || 0,
    pagina,
    limite,
  };
}

async function buscarCredencialPorId(id, { scope }) {
  const credentialId = parsePositiveInteger(id, 'Credencial', 'ACCESS_CREDENTIAL_ID_INVALIDO');
  const row = await runGet(`
    SELECT
      c.id,
      c.aluno_id,
      a.nome AS aluno_nome,
      c.tipo,
      c.provider,
      c.status,
      c.enrolled_at,
      c.revoked_at,
      c.created_at,
      c.updated_at
    FROM access_credentials c
    LEFT JOIN aluno a
      ON a.id = c.aluno_id
      AND a.tenant_id = c.tenant_id
      AND a.unit_id = c.unit_id
    WHERE c.id = ?
      AND c.tenant_id = ?
      AND c.unit_id = ?
      AND c.deleted_at IS NULL
  `, [credentialId, scope.tenant_id, scope.unit_id]);

  if (!row) {
    throw new AppError(
      'Credencial de acesso nao encontrada',
      404,
      'ACCESS_CREDENTIAL_NAO_ENCONTRADA'
    );
  }

  return row;
}

async function listarCredenciaisPorAluno(alunoId, { scope, query = {} }) {
  return listarCredenciais({ scope, query, alunoId });
}

module.exports = {
  listarDispositivos,
  buscarDispositivoPorId,
  listarCredenciais,
  buscarCredencialPorId,
  listarCredenciaisPorAluno,
};
