const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('../services/AuditService');
const FechamentoMensalService = require('../services/FechamentoMensalService');
const ReversaoControladaService = require('../services/ReversaoControladaService');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');
const { actorWithScope, requireScope } = require('../helpers/scope');

function validarCamposObrigatorios(body, campos) {
  for (const campo of campos) {
    if (!body[campo]) return `Campo obrigatorio ausente: ${campo}`;
  }
  return null;
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
      LEFT JOIN plano_contas pc ON cf.plano_contas_id = pc.id
      ${where}
      ORDER BY cf.data_lancamento DESC, cf.id DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const countRow = await runGet(`
      SELECT COUNT(*) AS total
      FROM conta_financeira cf
      LEFT JOIN plano_contas pc ON cf.plano_contas_id = pc.id
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

router.post('/', async (req, res, next) => {
  const { descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao } = req.body;
  const erro = validarCamposObrigatorios(req.body, ['descricao', 'tipo', 'valor', 'data_lancamento', 'status']);
  if (erro) return res.status(400).json({ error: erro });

  try {
    const scope = requireScope(req);
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    const criada = await runTransaction(async (tx) => {
      await FechamentoMensalService.assertPeriodoEditavelPorData(data_lancamento, 'criacao de conta financeira', tx, scope);

      const result = await tx.run(`
        INSERT INTO conta_financeira
        (descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao, origem, tenant_id, unit_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'conta_financeira', ?, ?, datetime('now'), datetime('now'))
      `, [descricao, tipo, valor, data_lancamento, status, plano_contas_id || null, observacao || null, scope.tenant_id, scope.unit_id]);

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
  const { descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao } = req.body;

  try {
    const scope = requireScope(req);
    const actor = actorWithScope(AuditService.getActorFromRequest(req), scope);
    const updated = await runTransaction(async (tx) => {
      const before = await tx.get('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
      if (!before || before.deleted_at) throw new AppError('Conta nao encontrada', 404, 'CONTA_NAO_ENCONTRADA');
      assertContaFinanceiraManual(before);

      await FechamentoMensalService.assertPeriodoEditavelPorData(
        data_lancamento || before.data_lancamento,
        'edicao de conta financeira',
        tx,
        scope
      );

      await tx.run(`
        UPDATE conta_financeira SET
          descricao = ?, tipo = ?, valor = ?, data_lancamento = ?, status = ?,
          plano_contas_id = ?, observacao = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [descricao, tipo, valor, data_lancamento, status, plano_contas_id || null, observacao || null, id]);

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

      await tx.run(
        'UPDATE conta_financeira SET status = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [status, id]
      );

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
