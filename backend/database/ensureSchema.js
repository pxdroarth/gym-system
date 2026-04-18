const { runQuery, runGet, runExecute } = require('../dbHelper');
const { USER_ROLES, USER_STATUS } = require('../constants/userRoles');

async function tableExists(tableName) {
  const row = await runGet(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return Boolean(row);
}

async function columnExists(tableName, columnName) {
  const row = await runGet(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  if (!row?.sql) return false;

  const normalizedSql = row.sql.replace(/["'`]/g, '').toLowerCase();
  return new RegExp(`\\b${columnName.toLowerCase()}\\b`).test(normalizedSql);
}

async function addColumnIfMissing(tableName, columnDefinition) {
  const columnName = columnDefinition.split(/\s+/)[0];
  if (!(await columnExists(tableName, columnName))) {
    await runExecute(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  }
}

async function ensureAuditLog() {
  if (await tableExists('audit_log')) return;

  await runExecute(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT,
      actor_name TEXT,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id TEXT,
      before_json TEXT,
      after_json TEXT,
      metadata_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

async function ensureFechamentoMensal() {
  if (!(await tableExists('fechamento_mensal'))) {
    await runExecute(`
      CREATE TABLE fechamento_mensal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano INTEGER NOT NULL,
        mes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'aberto',
        inconsistencias_json TEXT,
        fechado_em TEXT,
        reaberto_em TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(ano, mes)
      )
    `);
  }
}

async function ensureReversaoControlada() {
  if (!(await tableExists('reversao_controlada'))) {
    await runExecute(`
      CREATE TABLE reversao_controlada (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        modulo TEXT NOT NULL,
        registro_origem_id TEXT NOT NULL,
        lancamento_inverso_id TEXT,
        motivo TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  await addColumnIfMissing('reversao_controlada', 'tipo TEXT');
  await addColumnIfMissing('reversao_controlada', 'metadata_json TEXT');
}

async function ensurePlanoAssociadoColumns() {
  await addColumnIfMissing('plano_associado', "status TEXT NOT NULL DEFAULT 'ativo'");
  await addColumnIfMissing('plano_associado', 'created_at TEXT');
  await addColumnIfMissing('plano_associado', 'updated_at TEXT');
  await addColumnIfMissing('plano_associado', 'encerrado_em TEXT');
}

async function ensureReversaoSoftDeleteColumns() {
  await addColumnIfMissing('mensalidade', 'deleted_at TEXT');
  await addColumnIfMissing('mensalidade', 'reversao_controlada_id INTEGER');

  await addColumnIfMissing('venda_produto', 'deleted_at TEXT');
  await addColumnIfMissing('venda_produto', 'reversao_controlada_id INTEGER');

  await addColumnIfMissing('conta_financeira', 'deleted_at TEXT');
  await addColumnIfMissing('conta_financeira', 'reversao_controlada_id INTEGER');
}

async function ensureUsuarioInterno() {
  if (!(await tableExists('usuario_interno'))) {
    await runExecute(`
      CREATE TABLE usuario_interno (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT UNIQUE,
        login TEXT UNIQUE,
        papel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativo',
        senha_hash TEXT,
        ultimo_acesso_em TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        created_by TEXT,
        updated_by TEXT
      )
    `);
  }

  const count = await runGet('SELECT COUNT(*) AS total FROM usuario_interno');
  if (Number(count?.total || 0) === 0) {
    await runExecute(
      `INSERT INTO usuario_interno
        (nome, email, login, papel, status, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        'Administrador Bootstrap',
        'admin.local@sistema',
        'admin',
        USER_ROLES.ADMIN,
        USER_STATUS.ATIVO,
        'bootstrap',
        'bootstrap',
      ]
    );
  }
}

async function ensureSchema() {
  await ensureAuditLog();
  await ensureFechamentoMensal();
  await ensureReversaoControlada();
  await ensurePlanoAssociadoColumns();
  await ensureReversaoSoftDeleteColumns();
  await ensureUsuarioInterno();
}

module.exports = ensureSchema;
