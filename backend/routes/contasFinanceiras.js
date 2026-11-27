const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('../services/AuditService');
const FechamentoMensalService = require('../services/FechamentoMensalService');
const ReversaoControladaService = require('../services/ReversaoControladaService');
const EstornoBaixaContaService = require('../services/EstornoBaixaContaService');
const { PERMISSIONS, USER_ROLES, roleHasPermission } = require('../constants/userRoles');
const { requirePermission, assertActiveOperator } = require('../middlewares/requirePermission');
const { actorWithScope, requireScope } = require('../helpers/scope');

function validarDataLancamento(data) {
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data) && !data.startsWith('0000-')) {
    const parsed = new Date(`${data}T00:00:00.000Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === data) return;
  }
  throw new AppError('Informe uma data de lancamento valida no formato AAAA-MM-DD', 400, 'DATA_LANCAMENTO_INVALIDA');
}

function validarCamposObrigatorios(body, campos) {
  for (const campo of campos) {
    if (!body[campo]) return `Campo obrigatorio ausente: ${campo}`;
  }
  return null;
}

// Categoria informada precisa ser da Rede da operacao. Checada na mesma
// transacao da gravacao; categoria de outra Rede recusa sem gravar.
async function assertCategoriaDaRede(tx, planoContasId, scope) {
  if (planoContasId === undefined || planoContasId === null || planoContasId === '') return null;
  const id = Number(planoContasId);
  const row = Number.isInteger(id) && id > 0
    ? await tx.get('SELECT id FROM plano_contas WHERE id = ? AND tenant_id = ?', [id, scope.tenant_id])
    : null;
  if (!row) {
    throw new AppError('Categoria (plano de contas) invalida para esta rede', 422, 'PLANO_CONTAS_INVALIDO');
  }
  return row.id;
}

function assertContaFinanceiraManual(conta) {
  if (String(conta?.origem || '').trim() === 'conta_financeira') return;

  throw new AppError(
    'Lancamento financeiro derivado deve ser alterado pelo fluxo de origem ou reversao apropriada.',
    409,
    'CONTA_FINANCEIRA_DERIVADA_PROTEGIDA'
  );
}

router.get('/', async (req, res, next) => {
  const { tipo, status, data_inicial, data_final, descricao = '', page = 1, perPage = 10 } = req.query;
  const scope = requireScope(req);
  const params = [scope.tenant_id, scope.unit_id];
  let where = "WHERE cf.origem = 'conta_financeira' AND cf.deleted_at IS NULL AND cf.tenant_id = ? AND cf.unit_id = ?";

  if (tipo && tipo !== 'todos') {
    where += ' AND cf.tipo = ?';
    params.push(tipo);
  }
  if (status && status !== 'todos') {
    where += ' AND cf.status = ?';
    params.push(status);
  }
  if (data_inicial) {
    where += ' AND date(cf.data_lancamento) >= date(?)';
    params.push(data_inicial);
  }
  if (data_final) {
    where += ' AND date(cf.data_lancamento) <= date(?)';
    params.push(data_final);
  }
  if (descricao && descricao.trim() !== '') {
    where += ' AND LOWER(cf.descricao) LIKE ?';
    params.push(`%${descricao.toLowerCase()}%`);
  }

  const limit = parseInt(perPage) || 10;
  const offset = ((parseInt(page) || 1) - 1) * limit;

  try {
    const rows = await runQuery(`
      SELECT cf.*, pc.nome AS plano_nome
      FROM conta_financeira cf
      LEFT JOIN plano_contas pc ON cf.plano_contas_id = pc.id AND pc.tenant_id = cf.tenant_id
      ${where}
      ORDER BY cf.data_lancamento DESC, cf.id DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const countRow = await runGet(`
      SELECT COUNT(*) AS total
      FROM conta_financeira cf
      ${where}
    `, params);

    res.json({
      data: rows,
      total: countRow ? countRow.total : 0,
      page: parseInt(page),
      perPage: limit,
    });
  } catch (error) {
    next(error);
  }
});

// ---------- Estorno de baixa de conta (L04, sublote C) ----------
// Cada etapa exige a propria permissao e o escopo da unidade; o servico repete
// identidade, papel, Rede e Unidade dentro da transacao. Voltar uma conta paga
// a pendente pelas rotas comuns continua recusado (409 REVERSAO_APROVACAO_NECESSARIA).
const ESTORNO_BAIXA_PERMISSIONS = [
  PERMISSIONS.CONTAS_BAIXA_ESTORNO_SOLICITAR,
  PERMISSIONS.CONTAS_BAIXA_ESTORNO_APROVAR,
  PERMISSIONS.CONTAS_BAIXA_ESTORNO_REGISTRAR_AUTORIZACAO,
  PERMISSIONS.CONTAS_BAIXA_ESTORNO_EXECUTAR,
];
function requireAlgumaPermissaoEstornoBaixa(req, _res, next) {
  try {
    const operator = assertActiveOperator(req);
    if (!ESTORNO_BAIXA_PERMISSIONS.some((p) => roleHasPermission(operator.papel, p))) {
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

router.get('/estornos-baixa', requireAlgumaPermissaoEstornoBaixa, etapa((req, scope) => EstornoBaixaContaService.listar(scope, req.query || {})));
router.get('/estornos-baixa/politica', requireAlgumaPermissaoEstornoBaixa, etapa((req, scope) => EstornoBaixaContaService.obterPolitica(scope)));
router.patch('/estornos-baixa/politica', async (req, res, next) => {
  try {
    const operator = assertActiveOperator(req);
    const scope = requireScope(req);
    if (operator.papel !== USER_ROLES.OWNER) {
      throw new AppError('Somente o dono pode configurar a politica de estorno', 403, 'PERMISSAO_NEGADA');
    }
    res.json(await EstornoBaixaContaService.definirPolitica(req.body?.contas_distintas, ator(req, scope), scope));
  } catch (error) {
    next(error);
  }
});
router.get('/estornos-baixa/autorizadores', requirePermission(PERMISSIONS.CONTAS_BAIXA_ESTORNO_REGISTRAR_AUTORIZACAO),
  etapa((req, scope) => EstornoBaixaContaService.listarAutorizadores(scope, ator(req, scope))));
router.post('/estornos-baixa/:estornoId/autorizacao-externa', requirePermission(PERMISSIONS.CONTAS_BAIXA_ESTORNO_REGISTRAR_AUTORIZACAO),
  etapa((req, scope) => EstornoBaixaContaService.registrarAutorizacaoExterna(req.params.estornoId, req.body || {}, ator(req, scope), scope)));
router.post('/estornos-baixa/:estornoId/aprovar', requirePermission(PERMISSIONS.CONTAS_BAIXA_ESTORNO_APROVAR),
  etapa((req, scope) => EstornoBaixaContaService.aprovar(req.params.estornoId, ator(req, scope), scope)));
router.post('/estornos-baixa/:estornoId/executar', requirePermission(PERMISSIONS.CONTAS_BAIXA_ESTORNO_EXECUTAR),
  etapa((req, scope) => EstornoBaixaContaService.executar(req.params.estornoId, ator(req, scope), scope)));
router.post('/:id/estornos-baixa', requirePermission(PERMISSIONS.CONTAS_BAIXA_ESTORNO_SOLICITAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const { estorno, existente } = await EstornoBaixaContaService.solicitar(req.params.id, req.body || {}, ator(req, scope), scope);
    if (existente) {
      res.set('Idempotent-Replayed', 'true');
      return res.status(200).json({ ...estorno, pedido_existente: true });
    }
    return res.status(201).json(estorno);
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  const body = req.body || {};
  const { descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao } = body;
  try {
    const scope = requireScope(req);
    validarDataLancamento(data_lancamento);
    const erro = validarCamposObrigatorios(body, ['descricao', 'tipo', 'valor', 'status']);
    if (erro) return res.status(400).json({ error: erro });
    const meioBaixa = EstornoBaixaContaService.normalizarMeioBaixa(body.meio_baixa);
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    const criada = await runTransaction(async (tx) => {
      await FechamentoMensalService.assertPeriodoEditavelPorData(data_lancamento, 'criacao de conta financeira', tx, scope);
      const categoria = await assertCategoriaDaRede(tx, plano_contas_id, scope);

      const result = await tx.run(`
        INSERT INTO conta_financeira
        (descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao, origem, tenant_id, unit_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'conta_financeira', ?, ?, datetime('now'), datetime('now'))
      `, [descricao, tipo, valor, data_lancamento, status, categoria, observacao || null, scope.tenant_id, scope.unit_id]);
      if (status === 'pago') await EstornoBaixaContaService.gravarBaixa(tx, result.lastID, actor, meioBaixa);

      const after = await tx.get('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [result.lastID, scope.tenant_id, scope.unit_id]);
      await AuditService.logAction({
        actor,
        action: 'criar_conta_financeira',
        module: 'contas_financeiras',
        recordType: 'conta_financeira',
        recordId: result.lastID,
        before: null,
        after,
        tenant_id: scope.tenant_id,
        unit_id: scope.unit_id,
      }, tx);

      return after;
    });

    res.status(201).json({ id: criada.id });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao } = req.body || {};

  try {
    const scope = requireScope(req);
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    const updated = await runTransaction(async (tx) => {
      const before = await tx.get('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
      if (!before || before.deleted_at) throw new AppError('Conta nao encontrada', 404, 'CONTA_NAO_ENCONTRADA');
      assertContaFinanceiraManual(before);

      const dataDestino = data_lancamento === undefined ? before.data_lancamento : data_lancamento;
      if (data_lancamento !== undefined) validarDataLancamento(dataDestino);

      // A-06: a edicao mexe no mes de origem (o lancamento sai dele) e no mes
      // de destino (o lancamento entra nele). Os dois precisam estar abertos na
      // unidade da operacao; qualquer um fechado recusa antes de gravar.
      await FechamentoMensalService.assertPeriodoEditavelPorData(
        before.data_lancamento,
        'edicao de conta financeira (mes de origem)',
        tx,
        scope
      );
      await FechamentoMensalService.assertPeriodoEditavelPorData(
        dataDestino,
        'edicao de conta financeira (mes de destino)',
        tx,
        scope
      );
      if ([descricao, tipo, valor, status].some((campo) => campo === undefined || campo === null)) {
        throw new AppError('Informe descricao, tipo, valor e status da conta', 400, 'CONTA_PAYLOAD_INVALIDO');
      }
      if (before.status === 'pago' && (status !== 'pago' || Number(valor) !== Number(before.valor)
        || tipo !== before.tipo || dataDestino !== before.data_lancamento)) {
        throw new AppError('Conta paga exige reversao aprovada', 409, 'REVERSAO_APROVACAO_NECESSARIA');
      }
      const categoria = await assertCategoriaDaRede(tx, plano_contas_id, scope);

      await tx.run(`
        UPDATE conta_financeira SET
          descricao = ?, tipo = ?, valor = ?, data_lancamento = ?, status = ?,
          plano_contas_id = ?, observacao = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [descricao, tipo, valor, dataDestino, status, categoria, observacao || null, id]);
      if (before.status !== 'pago' && status === 'pago') {
        await EstornoBaixaContaService.gravarBaixa(tx, id, actor, EstornoBaixaContaService.normalizarMeioBaixa(req.body?.meio_baixa));
      }

      const after = await tx.get('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
      await AuditService.logAction({
        actor,
        action: 'editar_conta_financeira',
        module: 'contas_financeiras',
        recordType: 'conta_financeira',
        recordId: id,
        before,
        after,
        tenant_id: scope.tenant_id,
        unit_id: scope.unit_id,
      }, tx);

      return after;
    });

    res.json({ message: 'Conta financeira atualizada com sucesso', conta: updated });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status e obrigatorio' });

  try {
    const scope = requireScope(req);
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    await runTransaction(async (tx) => {
      const before = await tx.get('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
      if (!before || before.deleted_at) throw new AppError('Conta nao encontrada', 404, 'CONTA_NAO_ENCONTRADA');
      assertContaFinanceiraManual(before);

      await FechamentoMensalService.assertPeriodoEditavelPorData(before.data_lancamento, 'alteracao de status de conta financeira', tx, scope);

      if (before.status === 'pago' && status !== 'pago') {
        throw new AppError('Conta paga exige reversao aprovada', 409, 'REVERSAO_APROVACAO_NECESSARIA');
      }

      await tx.run(
        'UPDATE conta_financeira SET status = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [status, id]
      );
      if (before.status !== 'pago' && status === 'pago') {
        await EstornoBaixaContaService.gravarBaixa(tx, id, actor, EstornoBaixaContaService.normalizarMeioBaixa(req.body?.meio_baixa));
      }

      const after = await tx.get('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
      await AuditService.logAction({
        actor,
        action: 'alterar_status_conta_financeira',
        module: 'contas_financeiras',
        recordType: 'conta_financeira',
        recordId: id,
        before,
        after,
        tenant_id: scope.tenant_id,
        unit_id: scope.unit_id,
      }, tx);
    });

    res.json({ message: 'Status da conta atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reverter', requirePermission(PERMISSIONS.REVERSAO_EXECUTAR), async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const before = await runGet('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [req.params.id, scope.tenant_id, scope.unit_id]);
    if (!before || before.deleted_at) throw new AppError('Conta nao encontrada', 404, 'CONTA_NAO_ENCONTRADA');
    assertContaFinanceiraManual(before);

    const data = await ReversaoControladaService.reverterContaFinanceira(
      req.params.id,
      req.body || {},
      actorWithScope(AuditService.getActorFromRequest(req), scope),
      scope
    );
    res.json({ ok: true, data, message: 'Conta financeira revertida com controle' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);

  try {
    const scope = requireScope(req);
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    const before = await runGet('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
    if (!before || before.deleted_at) throw new AppError('Conta nao encontrada para excluir', 404, 'CONTA_NAO_ENCONTRADA');
    assertContaFinanceiraManual(before);

    if (before.status === 'pago') {
      const data = await ReversaoControladaService.reverterContaFinanceira(id, req.body || {}, actor, scope);
      return res.json({ ok: true, data, message: 'Conta paga revertida com controle' });
    }

    await runTransaction(async (tx) => {
      await FechamentoMensalService.assertPeriodoEditavelPorData(before.data_lancamento, 'remocao logica de conta financeira', tx, scope);
      await tx.run(
        'UPDATE conta_financeira SET deleted_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?',
        [id]
      );

      const after = await tx.get('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
      await AuditService.logAction({
        actor,
        action: 'remover_conta_financeira_logicamente',
        module: 'contas_financeiras',
        recordType: 'conta_financeira',
        recordId: id,
        before,
        after,
        metadata: { motivo: req.body?.motivo || 'Remocao logica de conta pendente' },
        tenant_id: scope.tenant_id,
        unit_id: scope.unit_id,
      }, tx);
    });

    res.json({ message: 'Conta financeira removida logicamente com sucesso' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
