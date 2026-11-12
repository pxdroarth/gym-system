const express = require('express');
const router = express.Router();
const UserService = require('../services/UserService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');
const { requireScope } = require('../helpers/scope');

router.get('/me', (req, res, next) => {
  try {
    if (req.authError) {
      return res.status(401).json({
        ok: false,
        error: req.authError.message,
        code: req.authError.code,
      });
    }

    if (!req.operator || req.operator.blocked) {
      return res.status(401).json({
        ok: false,
        error: 'Operador nao resolvido',
        code: 'OPERADOR_NAO_RESOLVIDO',
      });
    }

    res.json({ ok: true, data: req.operator });
  } catch (error) {
    next(error);
  }
});

// Escopo (Rede/unidades gerenciaveis) e regras de papel sao aplicados no
// UserService; tenant_id em query/body so e aceito para platform_admin.
router.get('/', requirePermission(PERMISSIONS.USUARIOS_VISUALIZAR), async (req, res, next) => {
  try {
    const result = await UserService.listarUsuarios(req.operator, requireScope(req), req.query || {});
    res.json({ ok: true, data: result.usuarios, contexto: result.contexto });
  } catch (error) {
    next(error);
  }
});

router.get('/opcoes', requirePermission(PERMISSIONS.USUARIOS_VISUALIZAR), async (req, res, next) => {
  try {
    res.json({ ok: true, data: await UserService.opcoes(req.operator, requireScope(req), req.query || {}) });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission(PERMISSIONS.USUARIOS_CRIAR), async (req, res, next) => {
  try {
    const user = await UserService.criarUsuario(req.body || {}, req.operator, requireScope(req));
    res.status(201).json({ ok: true, data: user, message: 'Usuario criado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/papel', requirePermission(PERMISSIONS.USUARIOS_ALTERAR_PAPEL), async (req, res, next) => {
  try {
    const user = await UserService.alterarPapel(req.params.id, req.body?.papel, req.operator, requireScope(req), req.body?.tenant_id);
    res.json({ ok: true, data: user, message: 'Papel atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', requirePermission(PERMISSIONS.USUARIOS_ALTERAR_STATUS), async (req, res, next) => {
  try {
    const user = await UserService.alterarStatus(req.params.id, req.body?.status, req.operator, requireScope(req), req.body?.tenant_id);
    res.json({ ok: true, data: user, message: 'Status atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/unidades', requirePermission(PERMISSIONS.USUARIOS_ALTERAR_UNIDADES), async (req, res, next) => {
  try {
    const user = await UserService.alterarUnidades(req.params.id, req.body || {}, req.operator, requireScope(req));
    res.json({ ok: true, data: user, message: 'Unidades atualizadas com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/vinculo-unidade', requirePermission(PERMISSIONS.USUARIOS_ALTERAR_UNIDADES), async (req, res, next) => {
  try {
    await UserService.desativarVinculoLocal(req.params.id, req.operator, requireScope(req));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
