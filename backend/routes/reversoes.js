const express = require('express');
const router = express.Router();
const AuditService = require('../services/AuditService');
const ReversaoControladaService = require('../services/ReversaoControladaService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');
const { actorWithScope, requireScope } = require('../helpers/scope');

// S1-P0 (FV-02a): rotas legadas de reversao. Alem da permissao, passam o
// escopo da sessao ao servico, que so encontra registros da mesma
// Rede/Unidade (outra Rede ou unidade: 404, sem efeito).

router.post('/mensalidades/:id', requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const data = await ReversaoControladaService.reverterMensalidade(
      req.params.id,
      req.body || {},
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    );
    res.json({ ok: true, data, message: 'Mensalidade revertida com controle' });
  } catch (error) {
    next(error);
  }
});

router.post('/vendas/:id', requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const data = await ReversaoControladaService.reverterVenda(
      req.params.id,
      req.body || {},
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    );
    res.json({ ok: true, data, message: 'Venda revertida com controle' });
  } catch (error) {
    next(error);
  }
});

// Conta financeira e do modulo Financeiro: exige o acesso ao modulo alem do estorno.
router.post('/contas-financeiras/:id', requirePermission(PERMISSIONS.FINANCEIRO_ACESSAR), requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const data = await ReversaoControladaService.reverterContaFinanceira(
      req.params.id,
      req.body || {},
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    );
    res.json({ ok: true, data, message: 'Conta financeira revertida com controle' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
