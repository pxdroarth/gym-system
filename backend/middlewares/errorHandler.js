const AppError = require('../errors/AppError');

function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ok: false,
      code: err.code,
      details: err.details,
    });
  }

  console.error('[ERRO NA API]', err);
  return res.status(500).json({
    error: 'Erro interno do servidor',
    ok: false,
    code: 'INTERNAL_ERROR',
  });
}

module.exports = errorHandler;
