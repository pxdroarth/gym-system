const express = require('express');
const AppError = require('../errors/AppError');
const { runGet, runQuery } = require('../dbHelper');
const { PERMISSIONS, roleHasPermission } = require('../constants/userRoles');
const { assertActiveOperator } = require('../middlewares/requirePermission');

const router = express.Router();

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function toPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getAllowedUnitIds(req) {
  const units = req.operator?.allowedUnits || req.scope?.allowedUnits || [];
  return units
    .map((unit) => Number(unit.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function addLikeFilter(where, params, column, value) {
  if (!value) return;
  where.push(`${column} LIKE ?`);
  params.push(`%${value}%`);
}

function addExactFilter(where, params, column, value) {
  if (value === undefined || value === null || value === '') return;
  where.push(`${column} = ?`);
  params.push(value);
}

function resolveAuditAccess(req) {
  const operator = assertActiveOperator(req);
  // Leitura total e reservada a administracao de plataforma; leitura por
  // escopo continua limitada a tenant/unidades efetivamente autorizadas.
  const canViewTotal = roleHasPermission(operator.papel, PERMISSIONS.LOGS_VISUALIZAR_TOTAL);
  const canViewScope = roleHasPermission(operator.papel, PERMISSIONS.LOGS_VISUALIZAR_ESCOPO);

  if (!canViewTotal && !canViewScope) {
    throw new AppError('Permissao negada para consultar historico de atividades', 403, 'AUDIT_LOGS_FORBIDDEN');
  }

  if (!canViewTotal && !req.scope?.tenant_id) {
    throw new AppError('Escopo operacional nao resolvido para consultar historico', 403, 'AUDIT_SCOPE_NOT_FOUND');
  }

  return { operator, canViewTotal };
}

function applyScopeFilters(req, where, params, canViewTotal) {
  const requestedTenantId = req.query.tenant_id;
  const requestedUnitId = req.query.unit_id;

  if (canViewTotal) {
    addExactFilter(where, params, 'tenant_id', requestedTenantId);
    addExactFilter(where, params, 'unit_id', requestedUnitId);
    return;
  }

  const tenantId = Number(req.scope.tenant_id);
  if (requestedTenantId) {
    throw new AppError('Filtro por rede disponivel apenas para administracao da plataforma', 403, 'TENANT_FILTER_FORBIDDEN');
  }

  where.push('tenant_id = ?');
  params.push(tenantId);

  const allowedUnitIds = getAllowedUnitIds(req);
  const fallbackUnitId = Number(req.scope.unit_id);
  const scopedUnitIds = allowedUnitIds.length > 0 ? allowedUnitIds : [fallbackUnitId];

  if (requestedUnitId) {
    const parsedUnitId = Number(requestedUnitId);
    if (!scopedUnitIds.includes(parsedUnitId)) {
      throw new AppError('Unidade fora do escopo permitido para este operador', 403, 'UNIT_SCOPE_FORBIDDEN');
    }
    where.push('unit_id = ?');
    params.push(parsedUnitId);
    return;
  }

  where.push(`unit_id IN (${scopedUnitIds.map(() => '?').join(', ')})`);
  params.push(...scopedUnitIds);
}

function buildFilters(req, options = {}) {
  const { canViewTotal } = options;
  const where = [];
  const params = [];
  const query = req.query || {};

  applyScopeFilters(req, where, params, canViewTotal);

  const dataInicio = query.data_inicio || query.inicio;
  const dataFim = query.data_fim || query.fim;

  if (dataInicio) {
    where.push('date(created_at) >= date(?)');
    params.push(dataInicio);
  }

  if (dataFim) {
    where.push('date(created_at) <= date(?)');
    params.push(dataFim);
  }

  addLikeFilter(where, params, 'module', query.module || query.modulo);
  addLikeFilter(where, params, 'action', query.action || query.acao);
  addExactFilter(where, params, 'record_type', query.record_type);
  addExactFilter(where, params, 'record_id', query.record_id);
  addExactFilter(where, params, 'actor_id', query.actor_id);
  addLikeFilter(where, params, 'actor_name', query.actor || query.ator || query.usuario);

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { canViewTotal } = resolveAuditAccess(req);
    const pagina = toPositiveInt(req.query.pagina || req.query.page, 1);
    const limite = Math.min(toPositiveInt(req.query.limite || req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const offset = (pagina - 1) * limite;
    const { whereSql, params } = buildFilters(req, { canViewTotal });

    const totalRow = await runGet(`SELECT COUNT(*) AS total FROM audit_log ${whereSql}`, params);
    const logs = await runQuery(
      `
        SELECT
          id, actor_id, actor_name, action, module, record_type, record_id,
          before_json, after_json, metadata_json, tenant_id, unit_id, created_at
        FROM audit_log
        ${whereSql}
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limite, offset]
    );

    res.json({
      ok: true,
      data: {
        logs,
        total: totalRow?.total || 0,
        pagina,
        limite,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { canViewTotal } = resolveAuditAccess(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('Log de auditoria invalido', 400, 'AUDIT_LOG_ID_INVALIDO');
    }

    const { whereSql, params } = buildFilters(req, { canViewTotal });
    const idClause = whereSql ? `${whereSql} AND id = ?` : 'WHERE id = ?';
    const log = await runGet(
      `
        SELECT
          id, actor_id, actor_name, action, module, record_type, record_id,
          before_json, after_json, metadata_json, tenant_id, unit_id, created_at
        FROM audit_log
        ${idClause}
        LIMIT 1
      `,
      [...params, id]
    );

    if (!log) {
      throw new AppError('Historico nao encontrado no escopo permitido', 404, 'AUDIT_LOG_NOT_FOUND');
    }

    res.json({ ok: true, data: log });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
