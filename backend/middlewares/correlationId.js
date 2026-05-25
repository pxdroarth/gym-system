const { randomUUID } = require('crypto');

const CORRELATION_ID_MAX_LENGTH = 128;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;

function generateCorrelationId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }

  return `cid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveCorrelationId(req) {
  const incomingCorrelationId = req.get('x-correlation-id');

  if (typeof incomingCorrelationId === 'string') {
    const sanitizedCorrelationId = incomingCorrelationId.trim();

    if (
      sanitizedCorrelationId
      && sanitizedCorrelationId.length <= CORRELATION_ID_MAX_LENGTH
      && CORRELATION_ID_PATTERN.test(sanitizedCorrelationId)
    ) {
      return sanitizedCorrelationId;
    }
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
