const express = require('express');
const router = express.Router();
const AuditService = require('../services/AuditService');
const ReversaoControladaService = require('../services/ReversaoControladaService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');

router.post('/mensalidades/:id', requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const data = await ReversaoControladaService.reverterMensalidade(
      req.params.id,
      req.body || {},
      AuditService.getActorFromRequest(req)
    );
    res.json({ ok: true, data, message: 'Mensalidade revertida com controle' });
  } catch (error) {
    next(error);
  }
});

router.post('/vendas/:id', requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const data = await ReversaoControladaService.reverterVenda(
      req.params.id,
      req.body || {},
      AuditService.getActorFromRequest(req)
    );
    res.json({ ok: true, data, message: 'Venda revertida com controle' });
  } catch (error) {
    next(error);
  }
});

router.post('/contas-financeiras/:id', requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const data = await ReversaoControladaService.reverterContaFinanceira(
      req.params.id,
      req.body || {},
      AuditService.getActorFromRequest(req)
    );
    res.json({ ok: true, data, message: 'Conta financeira revertida com controle' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
