const express = require('express');
const router = express.Router();
const { runQuery } = require('../dbHelper');
const MensalidadeService = require('../services/MensalidadeService');
const AuditService = require('../services/AuditService');
const { actorWithScope, requireScope } = require('../helpers/scope');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');

router.post('/', requirePermission(PERMISSIONS.PAGAMENTOS_REGISTRAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const pagamento = await MensalidadeService.registrarPagamento(
      req.body || {},
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    );
    res.status(201).json(pagamento);
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
