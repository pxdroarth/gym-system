const express = require('express');
const router = express.Router();
const MensalidadeService = require('../services/MensalidadeService');
const { sincronizarFinanceiro } = require('../services/FinanceService');
const AuditService = require('../services/AuditService');
const ReversaoControladaService = require('../services/ReversaoControladaService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');

router.post('/', async (req, res, next) => {
  try {
    const criada = await MensalidadeService.criarMensalidade(req.body || {});
    await sincronizarFinanceiro();
    res.status(201).json(criada);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await MensalidadeService.listarMensalidades(req.query || {});
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/vigentes', async (_req, res, next) => {
  try {
    const rows = await MensalidadeService.listarVigentes();
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/alunos', async (_req, res, next) => {
  try {
    const alunos = await MensalidadeService.listarAlunosComMensalidades();
    res.json(alunos);
  } catch (error) {
    next(error);
  }
});

router.get('/aluno/:aluno_id', async (req, res, next) => {
  try {
    const data = await MensalidadeService.listarMensalidadesPorAluno(req.params.aluno_id, req.query || {});
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const atualizada = await MensalidadeService.atualizarMensalidade(req.params.id, req.body || {});
    await sincronizarFinanceiro();
    res.json(atualizada);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const atualizada = await MensalidadeService.atualizarMensalidade(req.params.id, {
      status: req.body?.status,
    });
    await sincronizarFinanceiro();
    res.json(atualizada);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reverter', requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const resultado = await ReversaoControladaService.reverterMensalidade(
      req.params.id,
      req.body || {},
      AuditService.getActorFromRequest(req)
    );
    res.json({ ok: true, data: resultado, message: 'Mensalidade revertida com controle' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await MensalidadeService.removerMensalidade(
      req.params.id,
      AuditService.getActorFromRequest(req),
      req.body?.motivo
    );
    await sincronizarFinanceiro();
    res.json({ message: 'Mensalidade removida logicamente com sucesso' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
