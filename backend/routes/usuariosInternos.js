const express = require('express');
const router = express.Router();
const UserService = require('../services/UserService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');

router.get('/me', (req, res, next) => {
  try {
    if (!req.operator || req.operator.blocked) {
      return res.status(401).json({
        ok: false,
        error: 'Operador nao resolvido',
        code: 'OPERADOR_NAO_RESOLVIDO',
      });
    }

    res.json({ ok: true, data: req.operator });
  } catch (error) {
    next(error);
  }
});

router.get('/', requirePermission(PERMISSIONS.LOGS_VISUALIZAR_TOTAL), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await UserService.listarUsuarios() });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission(PERMISSIONS.USUARIOS_CRIAR), async (req, res, next) => {
  try {
    const user = await UserService.criarUsuario(req.body || {}, req.operator);
    res.status(201).json({ ok: true, data: user, message: 'Usuario criado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/papel', requirePermission(PERMISSIONS.USUARIOS_ALTERAR_PAPEL), async (req, res, next) => {
  try {
    const user = await UserService.alterarPapel(req.params.id, req.body?.papel, req.operator);
    res.json({ ok: true, data: user, message: 'Papel atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', requirePermission(PERMISSIONS.USUARIOS_ALTERAR_STATUS), async (req, res, next) => {
  try {
    const user = await UserService.alterarStatus(req.params.id, req.body?.status, req.operator);
    res.json({ ok: true, data: user, message: 'Status atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
