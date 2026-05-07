const express = require('express');
const router = express.Router();
const AuthService = require('../services/AuthService');

router.post('/login', async (req, res, next) => {
  try {
    const result = await AuthService.login(req.body || {}, req);
    AuthService.setRefreshCookie(res, result.refreshCookie);
    res.json({ ok: true, data: result.data, message: 'Login realizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const result = await AuthService.refresh(req);
    AuthService.setRefreshCookie(res, result.refreshCookie);
    res.json({ ok: true, data: result.data, message: 'Sessao renovada com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = AuthService.extractBearerToken(req);
    const data = await AuthService.logout(token, req.operator, req);
    AuthService.clearRefreshCookie(res);
    res.json({ ok: true, data, message: 'Logout realizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.post('/logout-all', async (req, res, next) => {
  try {
    if (req.authError) {
      return res.status(401).json({
        ok: false,
        error: req.authError.message,
        code: req.authError.code,
      });
    }

    if (!req.operator || req.operator.blocked) {
      return res.status(401).json({
        ok: false,
        error: 'Operador nao autenticado',
        code: 'OPERADOR_NAO_AUTENTICADO',
      });
    }

    const data = await AuthService.logoutAll(req.operator, req);
    AuthService.clearRefreshCookie(res);
    res.json({ ok: true, data, message: 'Todas as sessoes foram encerradas com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.get('/me', (req, res) => {
  if (req.authError) {
    return res.status(401).json({
      ok: false,
      error: req.authError.message,
      code: req.authError.code,
    });
  }

  if (!req.operator || req.operator.blocked) {
    return res.status(401).json({
      ok: false,
      error: 'Operador nao autenticado',
      code: 'OPERADOR_NAO_AUTENTICADO',
    });
  }

  res.json({ ok: true, data: req.operator });
});

module.exports = router;
