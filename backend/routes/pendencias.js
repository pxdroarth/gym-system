// Pendencias por estorno e contato com o aluno (L04, sublote B).
const express = require('express');
const router = express.Router();
const AuditService = require('../services/AuditService');
const PendenciaService = require('../services/PendenciaService');
const { actorWithScope, requireScope } = require('../helpers/scope');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');

const ator = (req, scope) => actorWithScope(AuditService.getActorFromRequest(req), scope);

// Lista da unidade; `aluno_id` filtra as de um aluno.
router.get('/', requirePermission(PERMISSIONS.PENDENCIAS_VER), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await PendenciaService.listarPendencias(scope, { aluno_id: req.query?.aluno_id }));
  } catch (error) {
    next(error);
  }
});

// Contagem para o aviso ao entrar e o bloco do Dashboard.
router.get('/resumo', requirePermission(PERMISSIONS.PENDENCIAS_VER), async (req, res, next) => {
  try {
    res.json(await PendenciaService.resumo(requireScope(req)));
  } catch (error) {
    next(error);
  }
});

router.get('/contatos', requirePermission(PERMISSIONS.PENDENCIAS_VER), async (req, res, next) => {
  try {
    res.json(await PendenciaService.listarContatos(requireScope(req), req.query?.aluno_id));
  } catch (error) {
    next(error);
  }
});

router.post('/contatos', requirePermission(PERMISSIONS.ALUNOS_CONTATO_REGISTRAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.status(201).json(await PendenciaService.registrarContato(req.body || {}, ator(req, scope), scope));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
