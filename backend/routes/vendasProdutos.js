const express = require('express');
const router = express.Router();
const { runQuery, runGet } = require('../dbHelper');
const VendaService = require('../services/VendaService');
const AuditService = require('../services/AuditService');
const ReversaoControladaService = require('../services/ReversaoControladaService');
const EstornoVendaService = require('../services/EstornoVendaService');
const { PERMISSIONS, USER_ROLES } = require('../constants/userRoles');
const { requirePermission, assertActiveOperator } = require('../middlewares/requirePermission');
const AppError = require('../errors/AppError');
const { actorWithScope, requireScope } = require('../helpers/scope');

router.get('/', async (req, res, next) => {
  const { data_inicial, data_final, pagina = 1, limite = 10 } = req.query;
  const offset = (parseInt(pagina) - 1) * parseInt(limite);
  const scope = requireScope(req);
  const params = [scope.tenant_id, scope.unit_id];

  let filtros = 'WHERE vp.deleted_at IS NULL AND vp.tenant_id = ? AND vp.unit_id = ?';
  if (data_inicial) {
    filtros += ' AND DATE(vp.data_venda) >= DATE(?)';
    params.push(data_inicial);
  }
  if (data_final) {
    filtros += ' AND DATE(vp.data_venda) <= DATE(?)';
    params.push(data_final);
  }

  try {
    const vendas = await runQuery(`
      SELECT vp.id, vp.produto_id, vp.produto_nome, vp.quantidade, vp.preco_unitario, vp.valor_total, vp.data_venda,
             vp.reversao_controlada_id,
             (SELECT e.status FROM venda_estorno e WHERE e.venda_id = vp.id AND e.tenant_id = vp.tenant_id AND e.unit_id = vp.unit_id
              ORDER BY CASE e.status WHEN 'executada' THEN 0 WHEN 'aprovada' THEN 1 WHEN 'solicitada' THEN 2 ELSE 3 END, e.id DESC LIMIT 1) AS estorno_status,
             (SELECT e.id FROM venda_estorno e WHERE e.venda_id = vp.id AND e.tenant_id = vp.tenant_id AND e.unit_id = vp.unit_id
              ORDER BY CASE e.status WHEN 'executada' THEN 0 WHEN 'aprovada' THEN 1 WHEN 'solicitada' THEN 2 ELSE 3 END, e.id DESC LIMIT 1) AS estorno_id
      FROM venda_produto vp
      ${filtros}
      ORDER BY datetime(vp.data_venda) DESC, vp.id DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limite), offset]);

    const countResult = await runGet(`SELECT COUNT(*) as total FROM venda_produto vp ${filtros}`, params);
    res.json({ vendas, total: countResult?.total || 0, pagina: Number(pagina), limite: Number(limite) });
  } catch (error) {
    next(error);
  }
});

// ---------- Estorno de venda (L04, DN-3) ----------
// As etapas valem nos dois aliases (/vendas-produtos e /vendasProdutos), que
// montam este mesmo router. Cada etapa exige a propria permissao e o escopo
// da unidade; o servico repete identidade, papel, Rede e Unidade dentro da
// transacao. Nao ha rota que execute sem aprovacao valida.
const ESTORNO_PERMISSIONS = [
  PERMISSIONS.VENDAS_ESTORNO_SOLICITAR,
  PERMISSIONS.VENDAS_ESTORNO_APROVAR,
  PERMISSIONS.VENDAS_ESTORNO_REGISTRAR_AUTORIZACAO,
  PERMISSIONS.VENDAS_ESTORNO_EXECUTAR,
];

function requireAlgumaPermissaoEstorno(req, _res, next) {
  try {
    const operator = assertActiveOperator(req);
    const { roleHasPermission } = require('../constants/userRoles');
    if (!ESTORNO_PERMISSIONS.some((p) => roleHasPermission(operator.papel, p))) {
      throw new AppError('Permissao negada para esta acao', 403, 'PERMISSAO_NEGADA', { papel: operator.papel });
    }
    next();
  } catch (error) {
    next(error);
  }
}

const ator = (req, scope) => actorWithScope(AuditService.getActorFromRequest(req), scope);

router.get('/estornos', requireAlgumaPermissaoEstorno, async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await EstornoVendaService.listar(scope, req.query || {}));
  } catch (error) {
    next(error);
  }
});

// Politica da unidade: exigir tres contas distintas. Leitura para quem atua
// no estorno; alteracao somente pelo dono, com auditoria.
router.get('/estornos/politica', requireAlgumaPermissaoEstorno, async (req, res, next) => {
  try {
    res.json(await EstornoVendaService.obterPolitica(requireScope(req)));
  } catch (error) {
    next(error);
  }
});

router.patch('/estornos/politica', async (req, res, next) => {
  try {
    const operator = assertActiveOperator(req);
    const scope = requireScope(req);
    if (operator.papel !== USER_ROLES.OWNER) {
      throw new AppError('Somente o dono pode configurar a politica de estorno', 403, 'PERMISSAO_NEGADA');
    }
    res.json(await EstornoVendaService.definirPolitica(req.body?.contas_distintas, ator(req, scope), scope));
  } catch (error) {
    next(error);
  }
});

// Contas da unidade que podem autorizar (para registrar autorizacao externa).
router.get('/estornos/autorizadores', requirePermission(PERMISSIONS.VENDAS_ESTORNO_REGISTRAR_AUTORIZACAO), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await EstornoVendaService.listarAutorizadores(scope, ator(req, scope)));
  } catch (error) {
    next(error);
  }
});

router.post('/estornos/:estornoId/autorizacao-externa', requirePermission(PERMISSIONS.VENDAS_ESTORNO_REGISTRAR_AUTORIZACAO), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await EstornoVendaService.registrarAutorizacaoExterna(req.params.estornoId, req.body || {}, ator(req, scope), scope));
  } catch (error) {
    next(error);
  }
});

router.post('/estornos/:estornoId/aprovar', requirePermission(PERMISSIONS.VENDAS_ESTORNO_APROVAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await EstornoVendaService.aprovar(req.params.estornoId, ator(req, scope), scope));
  } catch (error) {
    next(error);
  }
});

router.post('/estornos/:estornoId/executar', requirePermission(PERMISSIONS.VENDAS_ESTORNO_EXECUTAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    res.json(await EstornoVendaService.executar(req.params.estornoId, req.body || {}, ator(req, scope), scope));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/estornos', requirePermission(PERMISSIONS.VENDAS_ESTORNO_SOLICITAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    // Um pedido ativo por venda: reenvio ou pedido concorrente recebe o
    // existente (200 + Idempotent-Replayed), sem alterar seu estado.
    const { estorno, existente } = await EstornoVendaService.solicitar(req.params.id, req.body || {}, ator(req, scope), scope);
    if (existente) {
      res.set('Idempotent-Replayed', 'true');
      return res.status(200).json({ ...estorno, pedido_existente: true });
    }
    res.status(201).json(estorno);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID invalido' });

  try {
    const scope = requireScope(req);
    const venda = await runGet(
      `SELECT id, produto_id, produto_nome, quantidade, preco_unitario, valor_total,
              data_venda, tenant_id, unit_id, deleted_at, reversao_controlada_id
       FROM venda_produto WHERE id = ? AND tenant_id = ? AND unit_id = ? AND deleted_at IS NULL`,
      [id, scope.tenant_id, scope.unit_id]
    );
    if (!venda) return res.status(404).json({ error: 'Venda nao encontrada' });
    res.json(venda);
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission(PERMISSIONS.VENDAS_REGISTRAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const { venda, reenvio } = await VendaService.registrarVenda(
      req.body || {},
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope,
      req.get('Idempotency-Key')
    );
    if (reenvio) {
      res.set('Idempotent-Replayed', 'true');
      return res.status(200).json(venda);
    }
    res.status(201).json(venda);
  } catch (error) {
    next(error);
  }
});

// Reversao direta (legada): continua bloqueada sem aprovacao
// (409 REVERSAO_APROVACAO_NECESSARIA). O estorno de venda usa o fluxo acima.
router.post('/:id/reverter', requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const resultado = await ReversaoControladaService.reverterVenda(
      req.params.id,
      req.body || {},
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    );
    res.json({ ok: true, data: resultado, message: 'Venda revertida com controle' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
