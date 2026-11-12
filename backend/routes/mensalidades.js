const express = require('express');
const { runTransaction } = require('../dbHelper');
const router = express.Router();
const MensalidadeService = require('../services/MensalidadeService');
const { sincronizarFinanceiro } = require('../services/FinanceService');
const AuditService = require('../services/AuditService');
const ReversaoControladaService = require('../services/ReversaoControladaService');
const AppError = require('../errors/AppError');
const { PERMISSIONS } = require('../constants/userRoles');
const { MENSALIDADE_STATUS } = require('../constants/domainStates');
const { assertPermission, requirePermission } = require('../middlewares/requirePermission');
const { actorWithScope, requireScope } = require('../helpers/scope');

function isFinancialMensalidadeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return [MENSALIDADE_STATUS.PAGO, MENSALIDADE_STATUS.PARCIAL].includes(normalized);
}

function assertGenericStatusChangeAllowed(status) {
  // "pago" e "parcial" produzem efeito financeiro real. A rota generica de
  // mensalidade nao pode virar atalho para registrar recebimento; use o fluxo
  // canonico de pagamento para manter pagamento, mensalidade e financeiro juntos.
  if (isFinancialMensalidadeStatus(status)) {
    throw new AppError(
      'Status financeiro deve ser alterado pelo fluxo de pagamento.',
      400,
      'MENSALIDADE_STATUS_FINANCEIRO_CANONICO',
      { status }
    );
  }
}

router.post('/padrao/previa', requirePermission(PERMISSIONS.MENSALIDADES_EMITIR_PADRAO), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const { preview } = await runTransaction((tx) => MensalidadeService.prepararMensalidadePadrao(req.body?.aluno_id, scope, tx));
    res.json(preview);
  } catch (error) {
    next(error);
  }
});

router.post('/padrao', requirePermission(PERMISSIONS.MENSALIDADES_EMITIR_PADRAO), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    const resultado = await MensalidadeService.emitirMensalidadePadrao(req.body?.aluno_id, actor, scope, req.body?.previa);
    res.status(resultado.criada ? 201 : 200).json(resultado.mensalidade);
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission(PERMISSIONS.MENSALIDADES_GERENCIAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    assertGenericStatusChangeAllowed(req.body?.status);
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    const criada = await runTransaction(async (tx) => {
      const mensalidade = await MensalidadeService.criarMensalidade(req.body || {}, scope, tx);
      const plano = await tx.get('SELECT valor_base FROM plano WHERE id = ? AND tenant_id = ?', [mensalidade.plano_id, scope.tenant_id]);
      if (mensalidade.desconto_aplicado > 0 || mensalidade.valor_cobrado < Number(plano?.valor_base)) {
        assertPermission(req, PERMISSIONS.MENSALIDADES_DESCONTO);
        const motivo = MensalidadeService.motivoDesconto(req.body?.motivo_desconto);
        await AuditService.logAction({
          actor, action: 'conceder_desconto_excepcional', module: 'mensalidades', recordType: 'mensalidade',
          recordId: mensalidade.id, after: mensalidade, metadata: { motivo },
          tenant_id: scope.tenant_id, unit_id: scope.unit_id,
        }, tx);
      }
      return mensalidade;
    });
    await sincronizarFinanceiro(scope);
    res.status(201).json(criada);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const rows = await MensalidadeService.listarMensalidades(req.query || {}, scope);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/vigentes', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const rows = await MensalidadeService.listarVigentes(scope);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/alunos', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const alunos = await MensalidadeService.listarAlunosComMensalidades(scope);
    res.json(alunos);
  } catch (error) {
    next(error);
  }
});

router.get('/aluno/:aluno_id', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const data = await MensalidadeService.listarMensalidadesPorAluno(req.params.aluno_id, req.query || {}, scope);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermission(PERMISSIONS.MENSALIDADES_GERENCIAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    assertGenericStatusChangeAllowed(req.body?.status);
    const atualizada = await MensalidadeService.atualizarMensalidade(req.params.id, req.body || {}, scope, actorWithScope(AuditService.getActorFromRequest(req), scope));
    await sincronizarFinanceiro(scope);
    res.json(atualizada);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', requirePermission(PERMISSIONS.MENSALIDADES_GERENCIAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    assertGenericStatusChangeAllowed(req.body?.status);
    const atualizada = await MensalidadeService.atualizarMensalidade(req.params.id, {
      status: req.body?.status,
    }, scope, actorWithScope(AuditService.getActorFromRequest(req), scope));
    await sincronizarFinanceiro(scope);
    res.json(atualizada);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/desconto', requirePermission(PERMISSIONS.MENSALIDADES_DESCONTO), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    res.json(await MensalidadeService.concederDesconto(req.params.id, req.body || {}, actor, scope));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reverter', requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const resultado = await ReversaoControladaService.reverterMensalidade(
      req.params.id,
      req.body || {},
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    );
    res.json({ ok: true, data: resultado, message: 'Mensalidade revertida com controle' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermission(PERMISSIONS.MENSALIDADES_GERENCIAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    await MensalidadeService.removerMensalidade(
      req.params.id,
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      req.body?.motivo,
      scope
    );
    await sincronizarFinanceiro(scope);
    res.json({ message: 'Mensalidade removida logicamente com sucesso' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
