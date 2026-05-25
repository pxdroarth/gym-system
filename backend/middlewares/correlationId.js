const { randomUUID } = require('crypto');

function generateCorrelationId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }

  return `cid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveCorrelationId(req) {
  const incomingCorrelationId = req.get('x-correlation-id');

  if (typeof incomingCorrelationId === 'string' && incomingCorrelationId.trim()) {
    return incomingCorrelationId.trim();
  }

  return generateCorrelationId();
}

function correlationId(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const correlationIdValue = resolveCorrelationId(req);

  req.correlationId = correlationIdValue;
  req.correlation_id = correlationIdValue;
  res.locals.correlationId = correlationIdValue;
  res.setHeader('x-correlation-id', correlationIdValue);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      correlation_id: correlationIdValue,
      method: req.method,
      path: req.originalUrl || req.url,
      status_code: res.statusCode,
      duration_ms: Number(durationMs.toFixed(3)),
    }));
  });

  next();
}

module.exports = correlationId;
