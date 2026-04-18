const { runGet } = require('../dbHelper');
const { USER_STATUS } = require('../constants/userRoles');

async function operatorContext(req, _res, next) {
  try {
    const operatorId = req.headers?.['x-operator-id'] || req.headers?.['x-user-id'];
    req.operator = null;

    if (!operatorId) return next();

    const user = await runGet(
      `SELECT id, nome, email, login, papel, status
       FROM usuario_interno
       WHERE id = ?`,
      [operatorId]
    );

    if (!user) return next();
    if (user.status !== USER_STATUS.ATIVO) {
      req.operator = { ...user, blocked: true };
      return next();
    }

    req.operator = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = operatorContext;
