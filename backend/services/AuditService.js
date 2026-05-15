const { runExecute } = require('../dbHelper');

function safeJson(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return JSON.stringify({ serialization_error: true });
  }
}

function getActorFromRequest(req) {
  if (req?.operator && !req.operator.blocked) {
    return {
      id: String(req.operator.id),
      name: req.operator.nome || req.operator.login || `usuario_${req.operator.id}`,
      login: req.operator.login || null,
      role: req.operator.papel,
    };
  }

  if (!req) return { id: 'sistema', name: 'sistema' };

  return {
    id: req.headers?.['x-operator-id'] || req.headers?.['x-user-id'] || 'sistema',
    name: req.headers?.['x-operator-name'] || req.headers?.['x-user-name'] || 'sistema',
  };
}

async function logAction(entry = {}, client = null) {
  const db = client || { run: runExecute };
  const actor = entry.actor || { id: 'sistema', name: 'sistema' };

  await db.run(
    `INSERT INTO audit_log
      (actor_id, actor_name, action, module, record_type, record_id, before_json, after_json, metadata_json, tenant_id, unit_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actor.id || 'sistema',
      actor.name || 'sistema',
      entry.action,
      entry.module,
      entry.recordType,
      entry.recordId === undefined || entry.recordId === null ? null : String(entry.recordId),
      safeJson(entry.before),
      safeJson(entry.after),
      safeJson(entry.metadata),
      entry.tenant_id || entry.tenantId || actor.tenant_id || actor.tenantId || null,
      entry.unit_id || entry.unitId || actor.unit_id || actor.unitId || null,
    ]
  );
}

module.exports = {
  getActorFromRequest,
  logAction,
};
