const { runQuery, runGet, runExecute } = require('../dbHelper');
const { USER_ROLES, USER_STATUS } = require('../constants/userRoles');
const { hashPassword } = require('../utils/passwordHash');
const { DEFAULT_TENANT, DEFAULT_UNIT, TENANT_STATUS, UNIT_STATUS, USER_SCOPE_STATUS } = require('../constants/scope');

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
  if (!(await tableExists(tableName))) return;
  const columnName = columnDefinition.split(/\s+/)[0];
  if (!(await columnExists(tableName, columnName))) {
    await runExecute(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  }
}

async function addColumnIfTableExists(tableName, columnDefinition) {
  if (!(await tableExists(tableName))) return;
  await addColumnIfMissing(tableName, columnDefinition);
}

async function ensureTenantUnitBase() {
  if (!(await tableExists('tenant'))) {
    await runExecute(`
      CREATE TABLE tenant (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        documento TEXT,
        status TEXT NOT NULL DEFAULT 'ativo',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  await addColumnIfMissing('tenant', 'plano_comercial TEXT');
  await addColumnIfMissing('tenant', "onboarding_status TEXT DEFAULT 'operacional'");

  if (!(await tableExists('unit'))) {
    await runExecute(`
      CREATE TABLE unit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        codigo TEXT,
        status TEXT NOT NULL DEFAULT 'ativa',
        is_matriz INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenant(id)
      )
    `);
  }

  if (!(await tableExists('usuario_tenant'))) {
    await runExecute(`
      CREATE TABLE usuario_tenant (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tenant_id INTEGER NOT NULL,
        papel_no_tenant TEXT,
        status TEXT NOT NULL DEFAULT 'ativo',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (usuario_id) REFERENCES usuario_interno(id),
        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
        UNIQUE(usuario_id, tenant_id)
      )
    `);
  }

  if (!(await tableExists('usuario_unit'))) {
    await runExecute(`
      CREATE TABLE usuario_unit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        unit_id INTEGER NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ativo',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (usuario_id) REFERENCES usuario_interno(id),
        FOREIGN KEY (unit_id) REFERENCES unit(id),
        UNIQUE(usuario_id, unit_id)
      )
    `);
  }

  const tenant = await runGet('SELECT * FROM tenant WHERE documento = ? LIMIT 1', [DEFAULT_TENANT.documento]);
  let tenantId = tenant?.id;
  if (!tenantId) {
    const result = await runExecute(
      `INSERT INTO tenant (nome, documento, status, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      [DEFAULT_TENANT.nome, DEFAULT_TENANT.documento, TENANT_STATUS.ATIVO]
    );
    tenantId = result.lastID;
  }

  const unit = await runGet(
    'SELECT * FROM unit WHERE tenant_id = ? AND codigo = ? LIMIT 1',
    [tenantId, DEFAULT_UNIT.codigo]
  );
  let unitId = unit?.id;
  if (!unitId) {
    const result = await runExecute(
      `INSERT INTO unit (tenant_id, nome, codigo, status, is_matriz, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
      [tenantId, DEFAULT_UNIT.nome, DEFAULT_UNIT.codigo, UNIT_STATUS.ATIVA]
    );
    unitId = result.lastID;
  }

  return { tenantId, unitId };
}

async function ensureScopeColumns() {
  await addColumnIfMissing('audit_log', 'tenant_id INTEGER');
  await addColumnIfMissing('audit_log', 'unit_id INTEGER');

  await addColumnIfTableExists('plano_associado', 'tenant_id INTEGER');
  await addColumnIfTableExists('plano_associado', 'unit_id INTEGER');

  await addColumnIfTableExists('aluno', 'tenant_id INTEGER');
  await addColumnIfTableExists('aluno', 'unit_id INTEGER');

  await addColumnIfTableExists('mensalidade', 'tenant_id INTEGER');
  await addColumnIfTableExists('mensalidade', 'unit_id INTEGER');

  await addColumnIfTableExists('pagamento', 'tenant_id INTEGER');
  await addColumnIfTableExists('pagamento', 'unit_id INTEGER');

  await addColumnIfTableExists('acesso', 'tenant_id INTEGER');
  await addColumnIfTableExists('acesso', 'unit_id INTEGER');

  await addColumnIfTableExists('produto', 'tenant_id INTEGER');
  await addColumnIfTableExists('produto', 'unit_id INTEGER');

  await addColumnIfTableExists('venda_produto', 'tenant_id INTEGER');
  await addColumnIfTableExists('venda_produto', 'unit_id INTEGER');

  await addColumnIfTableExists('conta_financeira', 'tenant_id INTEGER');
  await addColumnIfTableExists('conta_financeira', 'unit_id INTEGER');

  await addColumnIfTableExists('fechamento_mensal', 'tenant_id INTEGER');
  await addColumnIfTableExists('fechamento_mensal', 'unit_id INTEGER');

  await addColumnIfTableExists('reversao_controlada', 'tenant_id INTEGER');
  await addColumnIfTableExists('reversao_controlada', 'unit_id INTEGER');

  await addColumnIfTableExists('plano', 'tenant_id INTEGER');
  await addColumnIfTableExists('plano_contas', 'tenant_id INTEGER');

  await addColumnIfTableExists('ativo', 'tenant_id INTEGER');
  await addColumnIfTableExists('ativo', 'unit_id INTEGER');

  await addColumnIfTableExists('orcamento', 'tenant_id INTEGER');
  await addColumnIfTableExists('orcamento', 'unit_id INTEGER');
}

async function ensureLegacyAdministrativeTables() {
  if (!(await tableExists('ativo'))) {
    await runExecute(`
      CREATE TABLE ativo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        tipo TEXT,
        valor_aquisicao REAL,
        data_aquisicao TEXT,
        status TEXT,
        observacao TEXT,
        tenant_id INTEGER,
        unit_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT
      )
    `);
  }

  if (!(await tableExists('orcamento'))) {
    await runExecute(`
      CREATE TABLE orcamento (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano INTEGER,
        mes INTEGER,
        tipo TEXT,
        valor_previsto REAL,
        descricao TEXT,
        tenant_id INTEGER,
        unit_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT
      )
    `);
  }
}

async function backfillDefaultScope(tenantId, unitId) {
  const unitTables = [
    'aluno',
    'plano_associado',
    'mensalidade',
    'pagamento',
    'acesso',
    'produto',
    'venda_produto',
    'conta_financeira',
    'fechamento_mensal',
    'reversao_controlada',
  ];

  for (const tableName of unitTables) {
    if (!(await tableExists(tableName))) continue;
    if (await columnExists(tableName, 'tenant_id')) {
      await runExecute(`UPDATE ${tableName} SET tenant_id = ? WHERE tenant_id IS NULL`, [tenantId]);
    }
    if (await columnExists(tableName, 'unit_id')) {
      await runExecute(`UPDATE ${tableName} SET unit_id = ? WHERE unit_id IS NULL`, [unitId]);
    }
  }

  if ((await tableExists('plano')) && (await columnExists('plano', 'tenant_id'))) {
    await runExecute('UPDATE plano SET tenant_id = ? WHERE tenant_id IS NULL', [tenantId]);
  }

  if ((await tableExists('plano_contas')) && (await columnExists('plano_contas', 'tenant_id'))) {
    await runExecute('UPDATE plano_contas SET tenant_id = ? WHERE tenant_id IS NULL', [tenantId]);
  }

  for (const tableName of ['ativo', 'orcamento']) {
    if (!(await tableExists(tableName))) continue;
    if (await columnExists(tableName, 'tenant_id')) {
      await runExecute(`UPDATE ${tableName} SET tenant_id = ? WHERE tenant_id IS NULL`, [tenantId]);
    }
    if (await columnExists(tableName, 'unit_id')) {
      await runExecute(`UPDATE ${tableName} SET unit_id = ? WHERE unit_id IS NULL`, [unitId]);
    }
  }

  if (await tableExists('audit_log')) {
    await runExecute('UPDATE audit_log SET tenant_id = ? WHERE tenant_id IS NULL', [tenantId]);
    await runExecute('UPDATE audit_log SET unit_id = ? WHERE unit_id IS NULL', [unitId]);
  }
}

async function ensureExistingUserScopes(tenantId, unitId) {
  const users = await runQuery('SELECT id, papel FROM usuario_interno');
  for (const user of users) {
    const tenantLink = await runGet(
      'SELECT id FROM usuario_tenant WHERE usuario_id = ? AND tenant_id = ? LIMIT 1',
      [user.id, tenantId]
    );
    if (!tenantLink) {
      await runExecute(
        `INSERT INTO usuario_tenant (usuario_id, tenant_id, papel_no_tenant, status, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [user.id, tenantId, user.papel, USER_SCOPE_STATUS.ATIVO]
      );
    }

    const unitLink = await runGet(
      'SELECT id FROM usuario_unit WHERE usuario_id = ? AND unit_id = ? LIMIT 1',
      [user.id, unitId]
    );
    if (!unitLink) {
      await runExecute(
        `INSERT INTO usuario_unit (usuario_id, unit_id, is_default, status, created_at)
         VALUES (?, ?, 1, ?, datetime('now'))`,
        [user.id, unitId, USER_SCOPE_STATUS.ATIVO]
      );
    }
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
        tenant_id INTEGER,
        unit_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, unit_id, ano, mes)
      )
    `);
  }
}

async function ensureFechamentoMensalUnitUnique(defaultScope = {}) {
  if (!(await tableExists('fechamento_mensal'))) return;

  const row = await runGet(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'fechamento_mensal'"
  );
  const sql = String(row?.sql || '').replace(/\s+/g, ' ').toLowerCase();
  const alreadyScopedUnique = sql.includes('unique(tenant_id, unit_id, ano, mes)')
    || sql.includes('unique (tenant_id, unit_id, ano, mes)');
  const hasLegacyUnique = sql.includes('unique(ano, mes)') || sql.includes('unique (ano, mes)');

  if (alreadyScopedUnique || !hasLegacyUnique) return;

  await runExecute('ALTER TABLE fechamento_mensal RENAME TO fechamento_mensal_legacy_unique');
  await runExecute(`
    CREATE TABLE fechamento_mensal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'aberto',
      inconsistencias_json TEXT,
      fechado_em TEXT,
      reaberto_em TEXT,
      tenant_id INTEGER,
      unit_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, unit_id, ano, mes)
    )
  `);
  await runExecute(`
    INSERT INTO fechamento_mensal
      (id, ano, mes, status, inconsistencias_json, fechado_em, reaberto_em, tenant_id, unit_id, created_at, updated_at)
    SELECT
      id,
      ano,
      mes,
      status,
      inconsistencias_json,
      fechado_em,
      reaberto_em,
      COALESCE(tenant_id, ?),
      COALESCE(unit_id, ?),
      created_at,
      updated_at
    FROM fechamento_mensal_legacy_unique
  `, [defaultScope.tenantId || null, defaultScope.unitId || null]);
  await runExecute('DROP TABLE fechamento_mensal_legacy_unique');
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

async function ensurePlanoAssociadoTable() {
  if (await tableExists('plano_associado')) return;

  await runExecute(`
    CREATE TABLE plano_associado (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aluno_id INTEGER NOT NULL,
      responsavel_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo',
      tenant_id INTEGER,
      unit_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      encerrado_em TEXT
    )
  `);
}

async function ensurePlanoContasTable() {
  if (await tableExists('plano_contas')) return;

  await runExecute(`
    CREATE TABLE plano_contas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      descricao TEXT,
      quantidade_sugerida INTEGER,
      dia_sugerido INTEGER,
      tenant_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
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
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin123';
  const bootstrapPasswordHash = await hashPassword(bootstrapPassword);

  if (Number(count?.total || 0) === 0) {
    await runExecute(
      `INSERT INTO usuario_interno
        (nome, email, login, papel, status, senha_hash, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        'Administrador Bootstrap',
        'admin.local@sistema',
        'admin',
        USER_ROLES.PLATFORM_ADMIN,
        USER_STATUS.ATIVO,
        bootstrapPasswordHash,
        'bootstrap',
        'bootstrap',
      ]
    );

    if (!process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      console.warn('[BOOTSTRAP] Platform admin inicial criado com senha local explicita: admin123. Defina BOOTSTRAP_ADMIN_PASSWORD para controlar isso.');
    }
    return;
  }

  const bootstrapAdmin = await runGet(
    `SELECT id FROM usuario_interno
     WHERE login = 'admin'
       AND papel IN (?, ?)
       AND created_by = 'bootstrap'
       AND senha_hash IS NULL
      LIMIT 1`,
    [USER_ROLES.ADMIN, USER_ROLES.PLATFORM_ADMIN]
  );

  if (bootstrapAdmin) {
    await runExecute(
      `UPDATE usuario_interno
       SET senha_hash = ?, updated_by = 'bootstrap_auth_setup', updated_at = datetime('now')
       WHERE id = ?`,
      [bootstrapPasswordHash, bootstrapAdmin.id]
    );

    if (!process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      console.warn('[BOOTSTRAP] Senha local explicita aplicada apenas ao bootstrap existente: admin123. Defina BOOTSTRAP_ADMIN_PASSWORD para controlar isso.');
    }
  }

  const existingPlatformAdmin = await runGet(
    'SELECT id FROM usuario_interno WHERE papel = ? LIMIT 1',
    [USER_ROLES.PLATFORM_ADMIN]
  );
  const legacyBootstrapAdmin = await runGet(
    `SELECT id FROM usuario_interno
     WHERE login = 'admin'
       AND papel = ?
       AND created_by = 'bootstrap'
     LIMIT 1`,
    [USER_ROLES.ADMIN]
  );

  if (!existingPlatformAdmin && legacyBootstrapAdmin) {
    await runExecute(
      `UPDATE usuario_interno
       SET papel = ?, updated_by = 'bootstrap_platform_upgrade', updated_at = datetime('now')
       WHERE id = ?`,
      [USER_ROLES.PLATFORM_ADMIN, legacyBootstrapAdmin.id]
    );
    console.warn('[BOOTSTRAP] Admin bootstrap legado promovido para platform_admin para separar plataforma e academia.');
  }
}

async function ensureAuthSession() {
  if (await tableExists('auth_session')) {
    await addColumnIfMissing('auth_session', 'expires_at TEXT');
    await addColumnIfMissing('auth_session', 'revoked_at TEXT');
    await addColumnIfMissing('auth_session', 'last_used_at TEXT');
    await addColumnIfMissing('auth_session', 'ip TEXT');
    await addColumnIfMissing('auth_session', 'user_agent TEXT');
    return;
  }

  await runExecute(`
    CREATE TABLE auth_session (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      revoked_at TEXT,
      last_used_at TEXT,
      ip TEXT,
      user_agent TEXT,
      FOREIGN KEY (usuario_id) REFERENCES usuario_interno(id)
    )
  `);
}

async function ensureAuthRefreshToken() {
  if (await tableExists('auth_refresh_token')) {
    await addColumnIfMissing('auth_refresh_token', 'session_id INTEGER');
    await addColumnIfMissing('auth_refresh_token', 'usuario_id INTEGER');
    await addColumnIfMissing('auth_refresh_token', 'family_id TEXT');
    await addColumnIfMissing('auth_refresh_token', 'token_hash TEXT');
    await addColumnIfMissing('auth_refresh_token', "status TEXT NOT NULL DEFAULT 'ativo'");
    await addColumnIfMissing('auth_refresh_token', "created_at TEXT DEFAULT (datetime('now'))");
    await addColumnIfMissing('auth_refresh_token', 'expires_at TEXT');
    await addColumnIfMissing('auth_refresh_token', 'used_at TEXT');
    await addColumnIfMissing('auth_refresh_token', 'rotated_at TEXT');
    await addColumnIfMissing('auth_refresh_token', 'revoked_at TEXT');
    await addColumnIfMissing('auth_refresh_token', 'replaced_by_id INTEGER');
    await addColumnIfMissing('auth_refresh_token', 'ip TEXT');
    await addColumnIfMissing('auth_refresh_token', 'user_agent TEXT');
    return;
  }

  await runExecute(`
    CREATE TABLE auth_refresh_token (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      family_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      used_at TEXT,
      rotated_at TEXT,
      revoked_at TEXT,
      replaced_by_id INTEGER,
      ip TEXT,
      user_agent TEXT,
      FOREIGN KEY (session_id) REFERENCES auth_session(id),
      FOREIGN KEY (usuario_id) REFERENCES usuario_interno(id),
      FOREIGN KEY (replaced_by_id) REFERENCES auth_refresh_token(id)
    )
  `);
}

async function ensureSchema() {
  await ensureAuditLog();
  const defaultScope = await ensureTenantUnitBase();
  await ensureFechamentoMensal();
  await ensureFechamentoMensalUnitUnique(defaultScope);
  await ensureReversaoControlada();
  await ensureLegacyAdministrativeTables();
  await ensurePlanoAssociadoTable();
  await ensurePlanoContasTable();
  await ensurePlanoAssociadoColumns();
  await ensureReversaoSoftDeleteColumns();
  await ensureScopeColumns();
  await ensureUsuarioInterno();
  await ensureExistingUserScopes(defaultScope.tenantId, defaultScope.unitId);
  await backfillDefaultScope(defaultScope.tenantId, defaultScope.unitId);
  await ensureAuthSession();
  await ensureAuthRefreshToken();
}

module.exports = ensureSchema;
