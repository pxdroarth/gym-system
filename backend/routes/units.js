const express = require('express');
const router = express.Router();
const UnitService = require('../services/UnitService');
const { runGet, runTransaction } = require('../dbHelper');
const AuditService = require('../services/AuditService');
const AppError = require('../errors/AppError');
const { actorWithScope, requireScope } = require('../helpers/scope');
const { PERMISSIONS, USER_ROLES } = require('../constants/userRoles');
const { assertActiveOperator, requirePermission } = require('../middlewares/requirePermission');

function escopoDono(req) {
  assertActiveOperator(req);
  const scope = requireScope(req);
  if (req.operator.papel !== USER_ROLES.OWNER) {
    throw new AppError('Somente o dono pode configurar a politica de retorno', 403, 'PERMISSAO_NEGADA');
  }
  return scope;
}

router.get('/politica-retorno', async (req, res, next) => {
  try {
    const scope = escopoDono(req);
    const unit = await runGet('SELECT politica_retorno_mensal FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
    res.json({ politica: unit.politica_retorno_mensal || 'proporcional', configurada: !!unit.politica_retorno_mensal });
  } catch (error) {
    next(error);
  }
});

router.patch('/politica-retorno', async (req, res, next) => {
  try {
    const scope = escopoDono(req);
    const politica = req.body?.politica;
    if (!['integral', 'proporcional'].includes(politica)) {
      throw new AppError('Politica de retorno invalida', 400, 'POLITICA_RETORNO_INVALIDA');
    }
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    await runTransaction(async (tx) => {
      const before = await tx.get('SELECT politica_retorno_mensal FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
      await tx.run('UPDATE unit SET politica_retorno_mensal = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
        [politica, scope.unit_id, scope.tenant_id]);
      await AuditService.logAction({
        actor, action: 'configurar_politica_retorno', module: 'unidades', recordType: 'unit',
        recordId: scope.unit_id, before, after: { politica_retorno_mensal: politica },
        ...scope,
      }, tx);
    });
    res.json({ politica, configurada: true });
  } catch (error) {
    next(error);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    if (!req.operator || req.operator.blocked) {
      return res.status(401).json({
        ok: false,
        error: 'Operador nao autenticado',
        code: 'OPERADOR_NAO_AUTENTICADO',
      });
    }

    res.json({
      ok: true,
      data: {
        currentUnit: req.scope?.currentUnit || null,
        allowedUnits: await UnitService.listAllowedUnits(req.operator.id),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/tenant/:tenantId', requirePermission(PERMISSIONS.PLATFORM_TENANT_CONFIGURAR), async (req, res, next) => {
  try {
    res.json({ ok: true, data: await UnitService.listUnitsByTenant(req.params.tenantId) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requirePermission(PERMISSIONS.PLATFORM_TENANT_CONFIGURAR), async (req, res, next) => {
  try {
    const unit = await UnitService.atualizarUnitBasica(req.params.id, req.body || {}, req.operator);
    res.json({ ok: true, data: unit, message: 'Unidade atualizada com sucesso' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
