const AppError = require('../errors/AppError');

function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ok: false,
      code: err.code,
      details: err.details,
    });
  }

  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    correlation_id: req?.correlationId || req?.correlation_id || null,
    error_name: err?.name || 'Error',
    error_message: err?.message || 'Erro interno do servidor',
    status_code: 500,
  }));
  return res.status(500).json({
    success: false,
    error: 'internal_server_error',
    message: 'Erro interno do servidor.',
    correlation_id: req?.correlationId || req?.correlation_id || null,
  });
}

module.exports = errorHandler;
