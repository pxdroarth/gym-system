const express = require('express');
const router = express.Router();
const { runQuery } = require('../dbHelper');
const MensalidadeService = require('../services/MensalidadeService');
const AuditService = require('../services/AuditService');
const ReversaoControladaService = require('../services/ReversaoControladaService');
const AppError = require('../errors/AppError');
const { actorWithScope, requireScope } = require('../helpers/scope');
const EstornoPagamentoService = require('../services/EstornoPagamentoService');
const { PERMISSIONS, USER_ROLES, roleHasPermission } = require('../constants/userRoles');
const { requirePermission, assertActiveOperator } = require('../middlewares/requirePermission');

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

// ---------- Estorno de pagamento do aluno (L04, sublote A) ----------
// Cada etapa exige a propria permissao e o escopo da unidade; o servico repete
// identidade, papel, Rede e Unidade dentro da transacao. A rota direta
// /:id/estornar continua bloqueada (409 REVERSAO_APROVACAO_NECESSARIA).
const ESTORNO_PERMISSIONS = [
  PERMISSIONS.PAGAMENTOS_ESTORNO_SOLICITAR,
  PERMISSIONS.PAGAMENTOS_ESTORNO_APROVAR,
  PERMISSIONS.PAGAMENTOS_ESTORNO_REGISTRAR_AUTORIZACAO,
  PERMISSIONS.PAGAMENTOS_ESTORNO_EXECUTAR,
];
function requireAlgumaPermissaoEstorno(req, _res, next) {
  try {
    const operator = assertActiveOperator(req);
    if (!ESTORNO_PERMISSIONS.some((p) => roleHasPermission(operator.papel, p))) {
      throw new AppError('Permissao negada para esta acao', 403, 'PERMISSAO_NEGADA', { papel: operator.papel });
    }
    next();
  } catch (error) {
    next(error);
  }
}
const ator = (req, scope) => actorWithScope(AuditService.getActorFromRequest(req), scope);
const etapa = (fn) => async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await fn(req, scope));
  } catch (error) {
    next(error);
  }
};

router.get('/estornos', requireAlgumaPermissaoEstorno, etapa((req, scope) => EstornoPagamentoService.listar(scope, req.query || {})));
router.get('/estornos/politica', requireAlgumaPermissaoEstorno, etapa((req, scope) => EstornoPagamentoService.obterPolitica(scope)));
router.patch('/estornos/politica', async (req, res, next) => {
  try {
    const operator = assertActiveOperator(req);
    const scope = requireScope(req);
    if (operator.papel !== USER_ROLES.OWNER) {
      throw new AppError('Somente o dono pode configurar a politica de estorno', 403, 'PERMISSAO_NEGADA');
    }
    res.json(await EstornoPagamentoService.definirPolitica(req.body?.contas_distintas, ator(req, scope), scope));
  } catch (error) {
    next(error);
  }
});
router.get('/estornos/autorizadores', requirePermission(PERMISSIONS.PAGAMENTOS_ESTORNO_REGISTRAR_AUTORIZACAO),
  etapa((req, scope) => EstornoPagamentoService.listarAutorizadores(scope, ator(req, scope))));
router.post('/estornos/:estornoId/autorizacao-externa', requirePermission(PERMISSIONS.PAGAMENTOS_ESTORNO_REGISTRAR_AUTORIZACAO),
  etapa((req, scope) => EstornoPagamentoService.registrarAutorizacaoExterna(req.params.estornoId, req.body || {}, ator(req, scope), scope)));
router.post('/estornos/:estornoId/aprovar', requirePermission(PERMISSIONS.PAGAMENTOS_ESTORNO_APROVAR),
  etapa((req, scope) => EstornoPagamentoService.aprovar(req.params.estornoId, ator(req, scope), scope)));
router.post('/estornos/:estornoId/executar', requirePermission(PERMISSIONS.PAGAMENTOS_ESTORNO_EXECUTAR),
  etapa((req, scope) => EstornoPagamentoService.executar(req.params.estornoId, req.body || {}, ator(req, scope), scope)));
router.post('/:id/estornos', requirePermission(PERMISSIONS.PAGAMENTOS_ESTORNO_SOLICITAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    // Um pedido ativo por pagamento: reenvio devolve o existente (200).
    const { estorno, existente } = await EstornoPagamentoService.solicitar(req.params.id, req.body || {}, ator(req, scope), scope);
    if (existente) {
      res.set('Idempotent-Replayed', 'true');
      return res.status(200).json({ ...estorno, pedido_existente: true });
    }
    return res.status(201).json(estorno);
  } catch (error) {
    return next(error);
  }
});

// GS-07 P1 (D7): rota direta legada; segue bloqueada sem aprovacao.
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
      SELECT p.*, m.vencimento, m.valor_cobrado,
             (SELECT e.status FROM pagamento_estorno e WHERE e.pagamento_id = p.id AND e.tenant_id = p.tenant_id AND e.unit_id = p.unit_id
              ORDER BY CASE e.status WHEN 'executada' THEN 0 WHEN 'aprovada' THEN 1 WHEN 'solicitada' THEN 2 ELSE 3 END, e.id DESC LIMIT 1) AS estorno_status
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
