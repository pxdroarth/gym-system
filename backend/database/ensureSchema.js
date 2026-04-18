const { runQuery, runGet, runExecute } = require('../dbHelper');

async function tableExists(tableName) {
  const row = await runGet(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return Boolean(row);
}

async function columnExists(tableName, columnName) {
  const columns = await runQuery(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
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
  if (await tableExists('reversao_controlada')) return;

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

async function ensurePlanoAssociadoColumns() {
  await addColumnIfMissing('plano_associado', "status TEXT NOT NULL DEFAULT 'ativo'");
  await addColumnIfMissing('plano_associado', 'created_at TEXT');
  await addColumnIfMissing('plano_associado', 'updated_at TEXT');
  await addColumnIfMissing('plano_associado', 'encerrado_em TEXT');
}

async function ensureSchema() {
  await ensureAuditLog();
  await ensureFechamentoMensal();
  await ensureReversaoControlada();
  await ensurePlanoAssociadoColumns();
}

module.exports = ensureSchema;
