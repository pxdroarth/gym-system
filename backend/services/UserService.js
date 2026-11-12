// Usuarios internos com escopo de Rede/Unidade (GS-03).
//
// Regras validadas no servidor (a tela apenas reflete):
// - platform_admin gerencia qualquer Rede; owner gerencia a Rede atual inteira;
//   admin gerencia apenas usuarios cujas unidades estao todas entre as suas.
// - Ninguem altera o proprio papel, status ou unidades.
// - Apenas platform_admin atribui o papel platform_admin ou mexe em conta de plataforma.
// - Ninguem atribui papel acima do proprio (platform > owner > admin > demais).
// - Fora da plataforma, papel/status de usuario com vinculo ativo em outra Rede
//   nao podem ser alterados (papel e status sao globais ao usuario).
// - Todo usuario precisa de ao menos uma unidade autorizada; nao ha vinculo automatico.
const { runQuery, runGet, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const AuthService = require('./AuthService');
const { USER_ROLES, USER_STATUS, USER_ROLE_VALUES, USER_STATUS_VALUES, isValidRole, isValidStatus } = require('../constants/userRoles');
const { TENANT_STATUS, UNIT_STATUS, USER_SCOPE_STATUS } = require('../constants/scope');
const { hashPassword } = require('../utils/passwordHash');

const ORIGEM = 'usuarios_internos';

const ROLE_RANK = Object.freeze({
  [USER_ROLES.PLATFORM_ADMIN]: 100,
  [USER_ROLES.OWNER]: 80,
  [USER_ROLES.ADMIN]: 60,
  [USER_ROLES.GESTOR]: 20,
  [USER_ROLES.FINANCEIRO]: 20,
  [USER_ROLES.RECEPCAO]: 20,
  [USER_ROLES.OPERADOR_ACESSO]: 20,
});

const rank = (role) => ROLE_RANK[role] || 0;
const isPlatform = (operator) => operator?.papel === USER_ROLES.PLATFORM_ADMIN;
const readDb = () => ({ all: runQuery, get: runGet });

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

function normalizeUnitIds(value) {
  const list = Array.isArray(value) ? value : (value === undefined || value === null || value === '' ? [] : [value]);
  const ids = list.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new AppError('unit_ids invalido', 400, 'USUARIO_UNIDADES_INVALIDAS');
  }
  return [...new Set(ids)];
}

function sanitizeUser(user) {
  if (!user) return user;
  const { senha_hash, ...safe } = user;
  return safe;
}

function auditActor(operator, ctx) {
  return {
    id: operator?.id ? String(operator.id) : 'sistema',
    name: operator?.nome || operator?.login || 'sistema',
    role: operator?.papel || null,
    tenant_id: ctx?.tenantId || null,
    unit_id: ctx?.scopeUnitId || null,
  };
}

// Contexto administrativo do ator: Rede alvo e unidades que ele pode gerenciar.
async function resolveContext(operator, scope, requestedTenantId, db = readDb()) {
  if (!operator?.id) throw new AppError('Operador nao resolvido', 401, 'OPERADOR_NAO_RESOLVIDO');
  const scopeTenantId = Number(scope?.tenant_id) || null;
  const requested = requestedTenantId === undefined || requestedTenantId === null || requestedTenantId === ''
    ? null
    : Number(requestedTenantId);

  if (requested !== null && (!Number.isInteger(requested) || requested <= 0)) {
    throw new AppError('tenant_id invalido', 400, 'TENANT_ID_INVALIDO');
  }
  if (requested !== null && !isPlatform(operator) && requested !== scopeTenantId) {
    throw new AppError('Rede fora do escopo do operador', 403, 'TENANT_FORA_DO_ESCOPO');
  }

  const tenantId = requested || scopeTenantId;
  if (!tenantId) throw new AppError('Escopo de Rede nao resolvido', 403, 'SCOPE_NOT_RESOLVED');

  const tenant = await db.get('SELECT id, nome, status FROM tenant WHERE id = ?', [tenantId]);
  if (!tenant) throw new AppError('Rede nao encontrada', 404, 'TENANT_NAO_ENCONTRADO');

  let units;
  if (isPlatform(operator) || operator.papel === USER_ROLES.OWNER) {
    units = await db.all(
      `SELECT id, tenant_id, nome, codigo, status, is_matriz FROM unit
       WHERE tenant_id = ? AND status = ?
       ORDER BY is_matriz DESC, nome COLLATE NOCASE`,
      [tenantId, UNIT_STATUS.ATIVA]
    );
  } else {
    units = await db.all(
      `SELECT u.id, u.tenant_id, u.nome, u.codigo, u.status, u.is_matriz
       FROM usuario_unit uu
       JOIN unit u ON u.id = uu.unit_id
       JOIN usuario_tenant ut ON ut.usuario_id = uu.usuario_id AND ut.tenant_id = u.tenant_id
       WHERE uu.usuario_id = ? AND u.tenant_id = ?
         AND uu.status = ? AND u.status = ? AND ut.status = ?
       ORDER BY u.is_matriz DESC, u.nome COLLATE NOCASE`,
      [operator.id, tenantId, USER_SCOPE_STATUS.ATIVO, UNIT_STATUS.ATIVA, USER_SCOPE_STATUS.ATIVO]
    );
  }

  return {
    operator,
    tenant,
    tenantId,
    scopeUnitId: Number(scope?.unit_id) || null,
    platform: isPlatform(operator),
    units,
    unitIds: new Set(units.map((unit) => Number(unit.id))),
  };
}

async function loadUserLinks(db, userIds) {
  if (!userIds.length) return { units: [], tenants: [] };
  const marks = userIds.map(() => '?').join(', ');
  const units = await db.all(
    `SELECT uu.usuario_id, uu.unit_id, uu.is_default, uu.status, uu.origem,
            u.tenant_id, u.nome AS unit_nome, u.codigo AS unit_codigo, u.is_matriz
     FROM usuario_unit uu
     JOIN unit u ON u.id = uu.unit_id
     WHERE uu.usuario_id IN (${marks})`,
    userIds
  );
  const tenants = await db.all(
    `SELECT usuario_id, tenant_id, status FROM usuario_tenant WHERE usuario_id IN (${marks})`,
    userIds
  );
  return { units, tenants };
}

function describeTarget(user, links, ctx) {
  const activeUnits = links.units.filter((l) => l.usuario_id === user.id && l.status === USER_SCOPE_STATUS.ATIVO);
  const activeTenants = links.tenants.filter((l) => l.usuario_id === user.id && l.status === USER_SCOPE_STATUS.ATIVO);
  const tenantUnits = activeUnits.filter((l) => Number(l.tenant_id) === Number(ctx.tenantId));
  const otherTenantIds = new Set([
    ...activeUnits.filter((l) => Number(l.tenant_id) !== Number(ctx.tenantId)).map((l) => Number(l.tenant_id)),
    ...activeTenants.filter((l) => Number(l.tenant_id) !== Number(ctx.tenantId)).map((l) => Number(l.tenant_id)),
  ]);
  const inTenant = tenantUnits.length > 0 || activeTenants.some((l) => Number(l.tenant_id) === Number(ctx.tenantId));
  return { activeUnits, tenantUnits, inTenant, otherTenantIds };
}

// Retorna null se pode gerenciar, ou o AppError que impede.
function manageBlock(ctx, user, target, { roleOrStatus = false, unitOnly = false } = {}) {
  const operator = ctx.operator;
  if (Number(user.id) === Number(operator.id)) {
    return new AppError('Nao e permitido alterar o proprio usuario por esta tela', 403, 'USUARIO_AUTOGESTAO_BLOQUEADA');
  }
  if (user.papel === USER_ROLES.PLATFORM_ADMIN && !ctx.platform) {
    return new AppError('Conta de plataforma so pode ser gerida pela plataforma', 403, 'PLATFORM_ADMIN_RESTRITO');
  }
  if (ctx.platform) return null;
  if (!target.inTenant) {
    return new AppError('Usuario nao encontrado', 404, 'USUARIO_NAO_ENCONTRADO');
  }
  if (rank(user.papel) > rank(operator.papel)) {
    return new AppError('Papel do usuario esta acima do papel do operador', 403, 'HIERARQUIA_INSUFICIENTE');
  }
  if (!unitOnly && target.tenantUnits.some((l) => !ctx.unitIds.has(Number(l.unit_id)))) {
    return new AppError('Usuario possui unidades fora das que o operador gerencia', 403, 'USUARIO_FORA_DAS_UNIDADES_GERENCIAVEIS');
  }
  if (roleOrStatus && target.otherTenantIds.size > 0) {
    return new AppError('Usuario vinculado a outra Rede; papel e status so podem ser alterados pela plataforma', 403, 'USUARIO_MULTI_REDE_RESTRITO');
  }
  return null;
}

function assertAssignableRole(ctx, role) {
  if (!isValidRole(role)) throw new AppError('papel invalido', 400, 'USUARIO_PAPEL_INVALIDO');
  if (role === USER_ROLES.PLATFORM_ADMIN && !ctx.platform) {
    throw new AppError('Apenas platform_admin pode criar ou promover usuarios de plataforma', 403, 'PLATFORM_ADMIN_RESTRITO');
  }
  if (rank(role) > rank(ctx.operator.papel)) {
    throw new AppError('Nao e permitido atribuir papel acima do proprio', 403, 'HIERARQUIA_INSUFICIENTE');
  }
}

function assignableRoles(ctx) {
  return USER_ROLE_VALUES.filter((role) => {
    if (role === USER_ROLES.PLATFORM_ADMIN && !ctx.platform) return false;
    return rank(role) <= rank(ctx.operator.papel);
  });
}

function assertUnitsManageable(ctx, unitIds, { allowEmpty = false } = {}) {
  if (!unitIds.length && !allowEmpty) {
    throw new AppError('Informe ao menos uma unidade autorizada', 400, 'USUARIO_UNIDADE_OBRIGATORIA');
  }
  const outside = unitIds.filter((id) => !ctx.unitIds.has(id));
  if (outside.length) {
    throw new AppError('Unidade fora do escopo do operador', 403, 'UNIDADE_FORA_DO_ESCOPO', { unit_ids: outside });
  }
}

async function loadTarget(tx, ctx, id, options) {
  const userId = Number(id);
  if (!userId) throw new AppError('usuario_id invalido', 400, 'USUARIO_ID_INVALIDO');
  const user = await tx.get('SELECT * FROM usuario_interno WHERE id = ?', [userId]);
  if (!user) throw new AppError('Usuario nao encontrado', 404, 'USUARIO_NAO_ENCONTRADO');
  const links = await loadUserLinks(tx, [userId]);
  const target = describeTarget(user, links, ctx);
  const block = manageBlock(ctx, user, target, options);
  if (block) throw block;
  return { user, target };
}

function unitView(link) {
  return {
    id: link.unit_id,
    tenant_id: link.tenant_id,
    nome: link.unit_nome,
    codigo: link.unit_codigo,
    is_matriz: link.is_matriz,
    is_default: link.is_default,
    origem: link.origem || null,
  };
}

async function listarUsuarios(operator, scope, query = {}) {
  const db = readDb();
  const ctx = await resolveContext(operator, scope, query.tenant_id, db);

  let users;
  if (ctx.platform && !query.tenant_id) {
    users = await db.all(`
      SELECT id, nome, email, login, papel, status, ultimo_acesso_em, created_at, updated_at, created_by, updated_by
      FROM usuario_interno
      ORDER BY nome COLLATE NOCASE
    `);
  } else {
    users = await db.all(`
      SELECT DISTINCT u.id, u.nome, u.email, u.login, u.papel, u.status, u.ultimo_acesso_em, u.created_at, u.updated_at, u.created_by, u.updated_by
      FROM usuario_interno u
      WHERE (
        EXISTS (SELECT 1 FROM usuario_tenant ut WHERE ut.usuario_id = u.id AND ut.tenant_id = ? AND ut.status = 'ativo')
        OR EXISTS (
          SELECT 1 FROM usuario_unit uu JOIN unit un ON un.id = uu.unit_id
          WHERE uu.usuario_id = u.id AND un.tenant_id = ? AND uu.status = 'ativo'
        )
      )
      ${ctx.platform ? '' : "AND u.papel <> 'platform_admin'"}
      ORDER BY u.nome COLLATE NOCASE
    `, [ctx.tenantId, ctx.tenantId]);
  }

  const links = await loadUserLinks(db, users.map((u) => u.id));
  const rows = [];
  for (const user of users) {
    const target = describeTarget(user, links, ctx);
    // Admin so enxerga usuarios que compartilham ao menos uma unidade com ele.
    if (!ctx.platform && operator.papel !== USER_ROLES.OWNER
      && !target.tenantUnits.some((l) => ctx.unitIds.has(Number(l.unit_id)))) {
      continue;
    }
    const block = manageBlock(ctx, user, target);
    const roleBlock = block || manageBlock(ctx, user, target, { roleOrStatus: true });
    rows.push({
      ...user,
      unidades: (ctx.platform && !query.tenant_id ? target.activeUnits : target.tenantUnits).map(unitView),
      gerenciavel: !block,
      papel_status_editavel: !roleBlock,
      vinculo_local_desativavel: !ctx.platform
        && !manageBlock(ctx, user, target, { unitOnly: true })
        && target.tenantUnits.some((link) => Number(link.unit_id) === ctx.scopeUnitId),
      motivo_bloqueio: roleBlock ? roleBlock.code : null,
    });
  }

  return { usuarios: rows, contexto: await opcoesFromContext(ctx, db) };
}

async function opcoesFromContext(ctx, db = readDb()) {
  const data = {
    tenant: { id: ctx.tenant.id, nome: ctx.tenant.nome },
    unidades: ctx.units,
    papeis_atribuiveis: assignableRoles(ctx),
    status: USER_STATUS_VALUES,
    pode_escolher_rede: ctx.platform,
  };
  if (ctx.platform) {
    data.redes = await db.all('SELECT id, nome, status FROM tenant WHERE status = ? ORDER BY nome COLLATE NOCASE', [TENANT_STATUS.ATIVO]);
  }
  return data;
}

async function opcoes(operator, scope, query = {}) {
  const db = readDb();
  const ctx = await resolveContext(operator, scope, query.tenant_id, db);
  return opcoesFromContext(ctx, db);
}

async function criarUsuario(payload = {}, operator, scope) {
  const data = normalizeUserPayload(payload);
  if (!data.nome) throw new AppError('nome e obrigatorio', 400, 'USUARIO_NOME_OBRIGATORIO');
  if (!data.login && !data.email) throw new AppError('login ou email e obrigatorio', 400, 'USUARIO_IDENTIFICADOR_OBRIGATORIO');
  if (!isValidStatus(data.status)) throw new AppError('status invalido', 400, 'USUARIO_STATUS_INVALIDO');
  if (!data.senha) throw new AppError('senha inicial e obrigatoria', 400, 'USUARIO_SENHA_OBRIGATORIA');
  const unitIds = normalizeUnitIds(payload.unit_ids);
  const senhaHash = await hashPassword(data.senha);

  return runTransaction(async (tx) => {
    const ctx = await resolveContext(operator, scope, payload.tenant_id, tx);
    assertAssignableRole(ctx, data.papel);
    assertUnitsManageable(ctx, unitIds);
    const defaultUnitId = payload.unit_padrao_id ? Number(payload.unit_padrao_id) : unitIds[0];
    if (!unitIds.includes(defaultUnitId)) {
      throw new AppError('unit_padrao_id precisa estar entre as unidades autorizadas', 400, 'USUARIO_UNIDADE_PADRAO_INVALIDA');
    }

    if (data.login && await tx.get('SELECT id FROM usuario_interno WHERE login = ? LIMIT 1', [data.login])) {
      throw new AppError('Ja existe usuario com este login', 409, 'USUARIO_LOGIN_DUPLICADO');
    }
    if (data.email && await tx.get('SELECT id FROM usuario_interno WHERE email = ? LIMIT 1', [data.email])) {
      throw new AppError('Ja existe usuario com este email', 409, 'USUARIO_EMAIL_DUPLICADO');
    }

    const actorId = String(operator.id);
    const result = await tx.run(
      `INSERT INTO usuario_interno
        (nome, email, login, papel, status, senha_hash, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [data.nome, data.email, data.login, data.papel, data.status, senhaHash, actorId, actorId]
    );
    const userId = result.lastID;

    await tx.run(
      `INSERT INTO usuario_tenant (usuario_id, tenant_id, papel_no_tenant, status, origem, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [userId, ctx.tenantId, data.papel, USER_SCOPE_STATUS.ATIVO, ORIGEM]
    );
    for (const unitId of unitIds) {
      await tx.run(
        `INSERT INTO usuario_unit (usuario_id, unit_id, is_default, status, origem, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [userId, unitId, unitId === defaultUnitId ? 1 : 0, USER_SCOPE_STATUS.ATIVO, ORIGEM, actorId]
      );
    }

    const user = await tx.get('SELECT * FROM usuario_interno WHERE id = ?', [userId]);
    await AuditService.logAction({
      actor: auditActor(operator, ctx),
      action: 'criar_usuario_interno',
      module: 'usuarios_internos',
      recordType: 'usuario_interno',
      recordId: userId,
      before: null,
      after: { ...sanitizeUser(user), tenant_id: ctx.tenantId, unit_ids: unitIds, unit_padrao_id: defaultUnitId },
      metadata: { criou_admin: [USER_ROLES.ADMIN, USER_ROLES.OWNER].includes(data.papel) },
      tenant_id: ctx.tenantId,
      unit_id: ctx.scopeUnitId,
    }, tx);

    return { ...sanitizeUser(user), unit_ids: unitIds, unit_padrao_id: defaultUnitId };
  });
}

async function alterarPapel(id, papel, operator, scope, tenantId = null) {
  return runTransaction(async (tx) => {
    const ctx = await resolveContext(operator, scope, tenantId, tx);
    const { user: before } = await loadTarget(tx, ctx, id, { roleOrStatus: true });
    assertAssignableRole(ctx, papel);

    await tx.run(
      'UPDATE usuario_interno SET papel = ?, updated_by = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [papel, String(operator.id), before.id]
    );
    await tx.run(
      'UPDATE usuario_tenant SET papel_no_tenant = ?, updated_at = datetime(\'now\') WHERE usuario_id = ? AND tenant_id = ?',
      [papel, before.id, ctx.tenantId]
    );

    const after = await tx.get('SELECT * FROM usuario_interno WHERE id = ?', [before.id]);
    await AuditService.logAction({
      actor: auditActor(operator, ctx),
      action: 'alterar_papel_usuario',
      module: 'usuarios_internos',
      recordType: 'usuario_interno',
      recordId: before.id,
      before: sanitizeUser(before),
      after: sanitizeUser(after),
      metadata: { promoveu_admin: [USER_ROLES.ADMIN, USER_ROLES.OWNER].includes(papel) && before.papel !== papel },
      tenant_id: ctx.tenantId,
      unit_id: ctx.scopeUnitId,
    }, tx);

    if (before.papel !== after.papel) {
      await AuthService.revokeActiveSessionsForUser(before.id, auditActor(operator, ctx), {
        action: 'auth_sessions_revoked_by_role_change',
        reason: 'alteracao_de_papel',
        metadata: { affected_user_id: before.id, before_role: before.papel, after_role: after.papel },
      }, tx);
    }

    return sanitizeUser(after);
  });
}

async function alterarStatus(id, status, operator, scope, tenantId = null) {
  if (!isValidStatus(status)) throw new AppError('status invalido', 400, 'USUARIO_STATUS_INVALIDO');

  return runTransaction(async (tx) => {
    const ctx = await resolveContext(operator, scope, tenantId, tx);
    const { user: before } = await loadTarget(tx, ctx, id, { roleOrStatus: true });

    await tx.run(
      'UPDATE usuario_interno SET status = ?, updated_by = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [status, String(operator.id), before.id]
    );

    const after = await tx.get('SELECT * FROM usuario_interno WHERE id = ?', [before.id]);
    await AuditService.logAction({
      actor: auditActor(operator, ctx),
      action: 'alterar_status_usuario',
      module: 'usuarios_internos',
      recordType: 'usuario_interno',
      recordId: before.id,
      before: sanitizeUser(before),
      after: sanitizeUser(after),
      tenant_id: ctx.tenantId,
      unit_id: ctx.scopeUnitId,
    }, tx);

    if (before.status !== after.status) {
      await AuthService.revokeActiveSessionsForUser(before.id, auditActor(operator, ctx), {
        action: 'auth_sessions_revoked_by_status_change',
        reason: 'alteracao_de_status',
        metadata: { affected_user_id: before.id, before_status: before.status, after_status: after.status },
      }, tx);
    }

    return sanitizeUser(after);
  });
}

async function alterarUnidades(id, payload = {}, operator, scope) {
  const unitIds = normalizeUnitIds(payload.unit_ids);

  return runTransaction(async (tx) => {
    const ctx = await resolveContext(operator, scope, payload.tenant_id, tx);
    const { user, target } = await loadTarget(tx, ctx, id);
    // Lista vazia remove o usuario desta Rede; so e aceita se ele mantiver
    // unidade ativa em outra Rede (ninguem fica sem unidade autorizada).
    const keepsOtherTenant = target.activeUnits.some((l) => Number(l.tenant_id) !== Number(ctx.tenantId));
    if (!unitIds.length && !keepsOtherTenant) {
      throw new AppError('Informe ao menos uma unidade autorizada', 400, 'USUARIO_UNIDADE_OBRIGATORIA');
    }
    assertUnitsManageable(ctx, unitIds, { allowEmpty: true });

    const beforeIds = target.tenantUnits.map((l) => Number(l.unit_id)).sort((a, b) => a - b);
    const currentDefault = target.activeUnits.find((l) => Number(l.is_default) === 1);
    let defaultUnitId = payload.unit_padrao_id ? Number(payload.unit_padrao_id) : null;
    if (defaultUnitId && !unitIds.includes(defaultUnitId)) {
      throw new AppError('unit_padrao_id precisa estar entre as unidades autorizadas', 400, 'USUARIO_UNIDADE_PADRAO_INVALIDA');
    }
    if (!defaultUnitId) {
      const keepsDefault = currentDefault && (Number(currentDefault.tenant_id) !== Number(ctx.tenantId)
        || unitIds.includes(Number(currentDefault.unit_id)));
      const otherTenantUnit = target.activeUnits.find((l) => Number(l.tenant_id) !== Number(ctx.tenantId));
      defaultUnitId = keepsDefault
        ? Number(currentDefault.unit_id)
        : (unitIds[0] || Number(otherTenantUnit.unit_id));
    }

    const actorId = String(operator.id);
    const removed = beforeIds.filter((unitId) => !unitIds.includes(unitId));
    const added = unitIds.filter((unitId) => !beforeIds.includes(unitId));
    // Vinculo antigo (origem NULL) mantido por decisao explicita do operador
    // passa a ter origem confirmada; o que e removido fica inativo (historico).
    const confirmed = target.tenantUnits
      .filter((l) => !l.origem && unitIds.includes(Number(l.unit_id)))
      .map((l) => Number(l.unit_id));
    for (const unitId of confirmed) {
      await tx.run(
        `UPDATE usuario_unit SET origem = 'confirmado_manual', updated_by = ?, updated_at = datetime('now')
         WHERE usuario_id = ? AND unit_id = ?`,
        [actorId, user.id, unitId]
      );
    }

    for (const unitId of removed) {
      await tx.run(
        `UPDATE usuario_unit SET status = ?, is_default = 0, updated_by = ?, updated_at = datetime('now')
         WHERE usuario_id = ? AND unit_id = ?`,
        [USER_SCOPE_STATUS.INATIVO, actorId, user.id, unitId]
      );
    }
    for (const unitId of added) {
      const existing = await tx.get('SELECT id FROM usuario_unit WHERE usuario_id = ? AND unit_id = ?', [user.id, unitId]);
      if (existing) {
        await tx.run(
          `UPDATE usuario_unit SET status = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
          [USER_SCOPE_STATUS.ATIVO, actorId, existing.id]
        );
      } else {
        await tx.run(
          `INSERT INTO usuario_unit (usuario_id, unit_id, is_default, status, origem, created_by, created_at)
           VALUES (?, ?, 0, ?, ?, ?, datetime('now'))`,
          [user.id, unitId, USER_SCOPE_STATUS.ATIVO, ORIGEM, actorId]
        );
      }
    }

    const tenantLink = await tx.get('SELECT id, status FROM usuario_tenant WHERE usuario_id = ? AND tenant_id = ?', [user.id, ctx.tenantId]);
    if (!unitIds.length) {
      if (tenantLink && tenantLink.status === USER_SCOPE_STATUS.ATIVO) {
        await tx.run("UPDATE usuario_tenant SET status = ?, updated_at = datetime('now') WHERE id = ?", [USER_SCOPE_STATUS.INATIVO, tenantLink.id]);
      }
    } else if (!tenantLink) {
      await tx.run(
        `INSERT INTO usuario_tenant (usuario_id, tenant_id, papel_no_tenant, status, origem, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [user.id, ctx.tenantId, user.papel, USER_SCOPE_STATUS.ATIVO, ORIGEM]
      );
    } else if (tenantLink.status !== USER_SCOPE_STATUS.ATIVO) {
      await tx.run("UPDATE usuario_tenant SET status = ?, updated_at = datetime('now') WHERE id = ?", [USER_SCOPE_STATUS.ATIVO, tenantLink.id]);
    }

    const defaultChanged = !currentDefault || Number(currentDefault.unit_id) !== defaultUnitId;
    if (defaultChanged) {
      await tx.run('UPDATE usuario_unit SET is_default = 0 WHERE usuario_id = ?', [user.id]);
      await tx.run('UPDATE usuario_unit SET is_default = 1 WHERE usuario_id = ? AND unit_id = ?', [user.id, defaultUnitId]);
    }

    const afterIds = [...unitIds].sort((a, b) => a - b);
    const changed = removed.length > 0 || added.length > 0 || defaultChanged || confirmed.length > 0;
    if (changed) {
      await AuditService.logAction({
        actor: auditActor(operator, ctx),
        action: 'alterar_unidades_usuario',
        module: 'usuarios_internos',
        recordType: 'usuario_interno',
        recordId: user.id,
        before: { unit_ids: beforeIds, unit_padrao_id: currentDefault ? Number(currentDefault.unit_id) : null },
        after: { unit_ids: afterIds, unit_padrao_id: defaultUnitId },
        metadata: { tenant_id: ctx.tenantId, adicionadas: added, removidas: removed, vinculos_legados_confirmados: confirmed, removido_da_rede: unitIds.length === 0 },
        tenant_id: ctx.tenantId,
        unit_id: ctx.scopeUnitId,
      }, tx);

      if (removed.length > 0 || added.length > 0) {
        await AuthService.revokeActiveSessionsForUser(user.id, auditActor(operator, ctx), {
          action: 'auth_sessions_revoked_by_unit_change',
          reason: 'alteracao_de_unidades',
          metadata: { affected_user_id: user.id, adicionadas: added, removidas: removed },
        }, tx);
      }
    }

    return { ...sanitizeUser(user), unit_ids: afterIds, unit_padrao_id: defaultUnitId, alterado: changed };
  });
}

async function desativarVinculoLocal(id, operator, scope) {
  return runTransaction(async (tx) => {
    const ctx = await resolveContext(operator, scope, null, tx);
    if (ctx.platform) throw new AppError('Use a politica de suporte para esta acao', 403, 'PERMISSAO_NEGADA');
    const { user, target } = await loadTarget(tx, ctx, id, { unitOnly: true });
    const unitId = Number(scope.unit_id);
    assertUnitsManageable(ctx, [unitId]);
    const vinculo = target.tenantUnits.find((link) => Number(link.unit_id) === unitId);
    if (!vinculo) throw new AppError('Vinculo ativo nao encontrado nesta unidade', 404, 'USUARIO_VINCULO_NAO_ENCONTRADO');

    await tx.run(
      `UPDATE usuario_unit SET status = ?, is_default = 0, updated_by = ?, updated_at = datetime('now')
       WHERE usuario_id = ? AND unit_id = ?`,
      [USER_SCOPE_STATUS.INATIVO, String(operator.id), user.id, unitId]
    );
    const actor = auditActor(operator, ctx);
    await AuditService.logAction({
      actor,
      action: 'desativar_vinculo_unidade',
      module: 'usuarios_internos',
      recordType: 'usuario_interno',
      recordId: user.id,
      before: { status: USER_SCOPE_STATUS.ATIVO },
      after: { status: USER_SCOPE_STATUS.INATIVO },
      tenant_id: ctx.tenantId,
      unit_id: unitId,
    }, tx);
    await AuthService.revokeActiveSessionsForUser(user.id, actor, {
      action: 'auth_sessions_revoked_by_unit_change',
      reason: 'desativacao_de_vinculo_local',
      metadata: { affected_user_id: user.id, removidas: [unitId] },
    }, tx);
  });
}

module.exports = {
  desativarVinculoLocal,
  listarUsuarios,
  opcoes,
  criarUsuario,
  alterarPapel,
  alterarStatus,
  alterarUnidades,
  sanitizeUser,
  ROLE_RANK,
};
