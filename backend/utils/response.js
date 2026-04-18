function ok(res, data = null, message = null, statusCode = 200) {
  return res.status(statusCode).json({
    ok: true,
    data,
    message,
  });
}

module.exports = { ok };
