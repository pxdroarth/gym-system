const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');
const { requireScope } = require('../helpers/scope');
const { requirePermission } = require('../middlewares/requirePermission');
const { PERMISSIONS } = require('../constants/userRoles');
const {
  POLICY_FIELDS,
  normalizarPoliticaPlano,
  validarPoliticaPlanoInput,
} = require('../services/PlanoPolicyService');

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function toDbFlag(value) {
  return value ? 1 : 0;
}

function buildPolicyInput(body = {}, current = {}) {
  const policyInput = { ...current };
  for (const field of POLICY_FIELDS) {
    if (hasOwn(body, field)) {
      policyInput[field] = body[field];
    }
  }
  return policyInput;
}

function normalizePlanoPayload(body = {}, current = {}) {
  const nome = String(body.nome || '').trim();
  const valor_base = Number(body.valor_base);
  const descricao = body.descricao ? String(body.descricao).trim() : null;
  const duracao_em_dias = Number(body.duracao_em_dias || 30);
  const compartilhado = Number(body.compartilhado ? 1 : 0);
  const quantidade_max_pessoas = Number(body.quantidade_max_pessoas || 1);
  const policyInput = buildPolicyInput(body, current);
  const policy = normalizarPoliticaPlano(policyInput);

  return {
    nome,
    valor_base,
    descricao,
    duracao_em_dias,
    compartilhado,
    quantidade_max_pessoas,
    tipo_cobranca: policy.tipo_cobranca,
    exige_pagamento_ato: toDbFlag(policy.exige_pagamento_ato),
    gera_divida_automatica: toDbFlag(policy.gera_divida_automatica),
    gera_cobertura_apos_pagamento: toDbFlag(policy.gera_cobertura_apos_pagamento),
    permite_renovacao_avulsa: toDbFlag(policy.permite_renovacao_avulsa),
    desconto_percentual: policy.desconto_percentual,
    _policyInput: policyInput,
  };
}

function validarPlano(payload) {
  if (!payload.nome) return 'nome é obrigatório';
  if (!Number.isFinite(payload.valor_base) || payload.valor_base <= 0) return 'valor_base inválido';
  if (!Number.isInteger(payload.duracao_em_dias) || payload.duracao_em_dias <= 0) return 'duracao_em_dias inválida';
  if (!Number.isInteger(payload.quantidade_max_pessoas) || payload.quantidade_max_pessoas <= 0) return 'quantidade_max_pessoas inválida';
  if (payload.quantidade_max_pessoas > 1 && payload.compartilhado !== 1) return 'Planos com mais de 1 pessoa devem ser compartilhados';
  if (payload.quantidade_max_pessoas === 1 && payload.compartilhado !== 0) return 'Plano individual deve ter compartilhado = 0';
  const erroPolitica = validarPoliticaPlanoInput(payload._policyInput);
  if (erroPolitica) return erroPolitica;
  return null;
}

router.get('/', async (req, res) => {
  try {
    const scope = requireScope(req);
    const { compartilhado, q } = req.query;
    const filtros = ['tenant_id = ?'];
    const params = [scope.tenant_id];

    if (compartilhado === '0' || compartilhado === '1') {
      filtros.push('compartilhado = ?');
      params.push(Number(compartilhado));
    }

    if (q) {
      filtros.push('LOWER(nome) LIKE ?');
      params.push(`%${String(q).trim().toLowerCase()}%`);
    }

    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const rows = await runQuery(`
      SELECT *,
             CASE
               WHEN quantidade_max_pessoas > 1 THEN quantidade_max_pessoas - 1
               ELSE 0
             END AS max_vinculados
      FROM plano
      ${where}
      ORDER BY valor_base ASC, nome ASC
    `, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const scope = requireScope(req);
    const row = await runGet(`
      SELECT *,
             CASE
               WHEN quantidade_max_pessoas > 1 THEN quantidade_max_pessoas - 1
               ELSE 0
             END AS max_vinculados
      FROM plano
      WHERE id = ? AND tenant_id = ?
    `, [id, scope.tenant_id]);

    if (!row) return res.status(404).json({ error: 'Plano não encontrado' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requirePermission(PERMISSIONS.PLANOS_GERENCIAR), async (req, res) => {
  const payload = normalizePlanoPayload(req.body);
  const erro = validarPlano(payload);
  if (erro) return res.status(400).json({ error: erro });

  try {
    const scope = requireScope(req);
    const existente = await runGet(
      'SELECT id FROM plano WHERE LOWER(nome) = LOWER(?) AND tenant_id = ? LIMIT 1',
      [payload.nome, scope.tenant_id]
    );
    if (existente) return res.status(409).json({ error: 'Já existe um plano com esse nome' });

    const result = await runExecute(
      `INSERT INTO plano (
        nome, valor_base, descricao, duracao_em_dias, compartilhado, quantidade_max_pessoas, tenant_id,
        tipo_cobranca, exige_pagamento_ato, gera_divida_automatica, gera_cobertura_apos_pagamento,
        permite_renovacao_avulsa, desconto_percentual
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.nome,
        payload.valor_base,
        payload.descricao,
        payload.duracao_em_dias,
        payload.compartilhado,
        payload.quantidade_max_pessoas,
        scope.tenant_id,
        payload.tipo_cobranca,
        payload.exige_pagamento_ato,
        payload.gera_divida_automatica,
        payload.gera_cobertura_apos_pagamento,
        payload.permite_renovacao_avulsa,
        payload.desconto_percentual,
      ]
    );

    const criado = await runGet('SELECT * FROM plano WHERE id = ? AND tenant_id = ?', [result.lastID, scope.tenant_id]);
    res.status(201).json(criado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', requirePermission(PERMISSIONS.PLANOS_GERENCIAR), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const scope = requireScope(req);
    const atual = await runGet('SELECT * FROM plano WHERE id = ? AND tenant_id = ?', [id, scope.tenant_id]);
    if (!atual) return res.status(404).json({ error: 'Plano não encontrado para atualizar' });

    const payload = normalizePlanoPayload(req.body, atual);
    const erro = validarPlano(payload);
    if (erro) return res.status(400).json({ error: erro });

    const ocupacao = await runGet(
      `SELECT COUNT(*) AS total FROM aluno WHERE plano_id = ? AND status = 'ativo' AND tenant_id = ? AND unit_id = ?`,
      [id, scope.tenant_id, scope.unit_id]
    );

    if ((ocupacao?.total || 0) > payload.quantidade_max_pessoas) {
      return res.status(400).json({
        error: 'Não é possível reduzir quantidade_max_pessoas abaixo do total atual de alunos ativos neste plano'
      });
    }

    await runExecute(
      `UPDATE plano
       SET nome = ?, valor_base = ?, descricao = ?, duracao_em_dias = ?, compartilhado = ?, quantidade_max_pessoas = ?,
           tipo_cobranca = ?, exige_pagamento_ato = ?, gera_divida_automatica = ?,
           gera_cobertura_apos_pagamento = ?, permite_renovacao_avulsa = ?, desconto_percentual = ?
       WHERE id = ? AND tenant_id = ?`,
      [
        payload.nome,
        payload.valor_base,
        payload.descricao,
        payload.duracao_em_dias,
        payload.compartilhado,
        payload.quantidade_max_pessoas,
        payload.tipo_cobranca,
        payload.exige_pagamento_ato,
        payload.gera_divida_automatica,
        payload.gera_cobertura_apos_pagamento,
        payload.permite_renovacao_avulsa,
        payload.desconto_percentual,
        id,
        scope.tenant_id,
      ]
    );

    const atualizado = await runGet('SELECT * FROM plano WHERE id = ? AND tenant_id = ?', [id, scope.tenant_id]);
    res.json(atualizado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requirePermission(PERMISSIONS.PLANOS_GERENCIAR), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const scope = requireScope(req);
    const alunosAtivos = await runGet(
      'SELECT COUNT(*) AS total FROM aluno WHERE plano_id = ? AND tenant_id = ? AND unit_id = ?',
      [id, scope.tenant_id, scope.unit_id]
    );
    if ((alunosAtivos?.total || 0) > 0) {
      return res.status(400).json({ error: 'Não é possível excluir um plano vinculado a alunos' });
    }

    const result = await runExecute('DELETE FROM plano WHERE id = ? AND tenant_id = ?', [id, scope.tenant_id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Plano não encontrado para deletar' });
    res.json({ message: 'Plano deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
