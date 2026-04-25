const express = require('express');
const router = express.Router();
const MensalidadeService = require('../services/MensalidadeService');
const { sincronizarFinanceiro } = require('../services/FinanceService');
const AuditService = require('../services/AuditService');
const ReversaoControladaService = require('../services/ReversaoControladaService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');
const { actorWithScope, requireScope } = require('../helpers/scope');

router.post('/', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const criada = await MensalidadeService.criarMensalidade(req.body || {}, scope);
    await sincronizarFinanceiro();
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

router.put('/:id', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const atualizada = await MensalidadeService.atualizarMensalidade(req.params.id, req.body || {}, scope);
    await sincronizarFinanceiro();
    res.json(atualizada);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const atualizada = await MensalidadeService.atualizarMensalidade(req.params.id, {
      status: req.body?.status,
    }, scope);
    await sincronizarFinanceiro();
    res.json(atualizada);
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

router.delete('/:id', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    await MensalidadeService.removerMensalidade(
      req.params.id,
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      req.body?.motivo,
      scope
    );
    await sincronizarFinanceiro();
    res.json({ message: 'Mensalidade removida logicamente com sucesso' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
