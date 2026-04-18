const express = require('express');
const router = express.Router();
const FechamentoMensalService = require('../services/FechamentoMensalService');
const AuditService = require('../services/AuditService');

router.get('/:ano/:mes/analisar', async (req, res, next) => {
  try {
    res.json(await FechamentoMensalService.analisarPeriodo(req.params.ano, req.params.mes));
  } catch (error) {
    next(error);
  }
});

router.post('/:ano/:mes/fechar', async (req, res, next) => {
  try {
    res.json(await FechamentoMensalService.fecharPeriodo(
      req.params.ano,
      req.params.mes,
      AuditService.getActorFromRequest(req)
    ));
  } catch (error) {
    next(error);
  }
});

router.post('/:ano/:mes/reabrir', async (req, res, next) => {
  try {
    res.json(await FechamentoMensalService.reabrirPeriodo(
      req.params.ano,
      req.params.mes,
      AuditService.getActorFromRequest(req)
    ));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
