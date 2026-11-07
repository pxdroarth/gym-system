const express = require('express');
const router = express.Router();
const { runQuery } = require('../dbHelper');
const MensalidadeService = require('../services/MensalidadeService');
const AuditService = require('../services/AuditService');
const ReversaoControladaService = require('../services/ReversaoControladaService');
const AppError = require('../errors/AppError');
const { actorWithScope, requireScope } = require('../helpers/scope');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');

function chaveIdempotenciaDaRequisicao(req) {
  const doHeader = req.get('Idempotency-Key');
  const doCorpo = req.body?.chave_idempotencia;
  if (doHeader && doCorpo && String(doHeader).trim() !== String(doCorpo).trim()) {
    throw new AppError('Idempotency-Key e chave_idempotencia divergentes', 400, 'IDEMPOTENCIA_CHAVE_DIVERGENTE');
  }
  return doHeader || doCorpo || null;
}

router.post('/', requirePermission(PERMISSIONS.PAGAMENTOS_REGISTRAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const chave = chaveIdempotenciaDaRequisicao(req);
    const pagamento = await MensalidadeService.registrarPagamento(
      { ...(req.body || {}), chave_idempotencia: chave },
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    );
    if (pagamento.idempotente) {
      res.set('Idempotent-Replayed', 'true');
      return res.status(200).json(pagamento);
    }
    return res.status(201).json(pagamento);
  } catch (error) {
    return next(error);
  }
});

// GS-07 P1 (D7): estorna um pagamento especifico, integral ou parcial.
router.post('/:id/estornar', requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const resultado = await ReversaoControladaService.estornarPagamento(
      req.params.id,
      req.body || {},
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    );
    res.json(resultado);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const rows = await runQuery(`
      SELECT p.*, m.aluno_id, m.vencimento, m.valor_cobrado
      FROM pagamento p
      LEFT JOIN mensalidade m ON m.id = p.mensalidade_id
      WHERE p.tenant_id = ? AND p.unit_id = ?
      ORDER BY DATE(p.data_pagamento) DESC, p.id DESC
    `, [scope.tenant_id, scope.unit_id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/aluno/:aluno_id', async (req, res, next) => {
  const alunoId = parseInt(req.params.aluno_id);
  try {
    const scope = requireScope(req);
    const rows = await runQuery(`
      SELECT p.*, m.vencimento, m.valor_cobrado
      FROM pagamento p
      JOIN mensalidade m ON p.mensalidade_id = m.id
      WHERE m.aluno_id = ? AND p.tenant_id = ? AND p.unit_id = ?
      ORDER BY DATE(p.data_pagamento) DESC, p.id DESC
    `, [alunoId, scope.tenant_id, scope.unit_id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
