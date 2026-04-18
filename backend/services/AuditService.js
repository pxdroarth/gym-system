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
      (actor_id, actor_name, action, module, record_type, record_id, before_json, after_json, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ]
  );
}

module.exports = {
  getActorFromRequest,
  logAction,
};
