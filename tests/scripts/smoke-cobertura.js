const express = require('express');
const db = require('../../backend/database');
const { runGet, runQuery, runExecute } = require('../../backend/dbHelper');
const AccessService = require('../../backend/services/AccessService');
const planosRouter = require('../../backend/routes/planos');
const errorHandler = require('../../backend/middlewares/errorHandler');
const { MENSALIDADE_STATUS } = require('../../backend/constants/domainStates');

const PREFIX = 'SMOKE_COBERTURA_';
const RUN_ID = `${Date.now()}`;

const actor = {
  id: `${PREFIX}OPERADOR`,
  name: `${PREFIX}Operador`,
  login: `${PREFIX.toLowerCase()}operador`,
  role: 'admin',
  tenant_id: null,
  unit_id: null,
};

const created = {
  tenantId: null,
  unitId: null,
  planoAvulsoId: null,
  planoRecorrenteId: null,
  alunos: {},
  unsupportedPlanAvailable: false,
  unsupportedScenarioSkipped: null,
};

function ok(message) {
  console.log(`[OK] ${message}`);
}

function skip(message, details) {
  console.log(`[SKIP] ${message}${details ? ` - ${details}` : ''}`);
}

function fail(message, details) {
  const suffix = details ? ` - ${details}` : '';
  console.error(`[FALHOU] ${message}${suffix}`);
  process.exitCode = 1;
}

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateStr, months) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function periodFromDate(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  return {
    ano: date.getUTCFullYear(),
    mes: date.getUTCMonth() + 1,
  };
}

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

function moneyEquals(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

async function tableColumnExists(tableName, columnName) {
  const columns = await runQuery(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}

async function deleteByIds(table, ids) {
  if (!ids.length) return;
  await runExecute(`DELETE FROM ${table} WHERE id IN (${placeholders(ids)})`, ids);
}

async function cleanupFixtures() {
  const tenants = await runQuery('SELECT id FROM tenant WHERE nome LIKE ? OR documento LIKE ?', [`${PREFIX}%`, `${PREFIX}%`]);
  const tenantIds = tenants.map((row) => row.id);

  const units = await runQuery('SELECT id FROM unit WHERE nome LIKE ? OR codigo LIKE ?', [`${PREFIX}%`, `${PREFIX}%`]);
  const unitIds = units.map((row) => row.id);

  const alunos = await runQuery('SELECT id FROM aluno WHERE nome LIKE ?', [`${PREFIX}%`]);
  const alunoIds = alunos.map((row) => row.id);

  let mensalidadeIds = [];
  if (alunoIds.length) {
    const mensalidades = await runQuery(
      `SELECT id FROM mensalidade WHERE aluno_id IN (${placeholders(alunoIds)})`,
      alunoIds
    );
    mensalidadeIds = mensalidades.map((row) => row.id);
  }

  if (tenantIds.length && unitIds.length) {
    await runExecute(
      `DELETE FROM audit_log
       WHERE actor_id = ?
          OR actor_name LIKE ?
          OR (tenant_id IN (${placeholders(tenantIds)}) AND unit_id IN (${placeholders(unitIds)}))`,
      [actor.id, `${PREFIX}%`, ...tenantIds, ...unitIds]
    );
    await runExecute(
      `DELETE FROM fechamento_mensal
       WHERE tenant_id IN (${placeholders(tenantIds)}) AND unit_id IN (${placeholders(unitIds)})`,
      [...tenantIds, ...unitIds]
    );
  } else {
    await runExecute('DELETE FROM audit_log WHERE actor_id = ? OR actor_name LIKE ?', [actor.id, `${PREFIX}%`]);
  }

  if (mensalidadeIds.length) {
    await runExecute(
      `DELETE FROM conta_financeira WHERE origem = ? AND origem_id IN (${placeholders(mensalidadeIds)})`,
      ['mensalidade', ...mensalidadeIds]
    );
    await runExecute(`DELETE FROM pagamento WHERE mensalidade_id IN (${placeholders(mensalidadeIds)})`, mensalidadeIds);
  }

  if (alunoIds.length) {
    await runExecute(`DELETE FROM acesso WHERE aluno_id IN (${placeholders(alunoIds)})`, alunoIds);
    await runExecute(`DELETE FROM mensalidade WHERE aluno_id IN (${placeholders(alunoIds)})`, alunoIds);
    await runExecute(
      `DELETE FROM plano_associado
       WHERE aluno_id IN (${placeholders(alunoIds)})
          OR responsavel_id IN (${placeholders(alunoIds)})`,
      [...alunoIds, ...alunoIds]
    );
    await deleteByIds('aluno', alunoIds);
  }

  await runExecute('DELETE FROM plano WHERE nome LIKE ?', [`${PREFIX}%`]);
  await deleteByIds('unit', unitIds);
  await deleteByIds('tenant', tenantIds);
}

async function createPlan({ nome, valor, tipoCobranca = null }) {
  const hasTipoCobranca = await tableColumnExists('plano', 'tipo_cobranca');
  if (tipoCobranca && !hasTipoCobranca) {
    return null;
  }

  if (tipoCobranca) {
    const result = await runExecute(
      `INSERT INTO plano
        (nome, valor_base, valor, duracao_em_dias, quantidade_max_pessoas, tenant_id,
         tipo_cobranca, exige_pagamento_ato, gera_divida_automatica, gera_cobertura_apos_pagamento,
         permite_renovacao_avulsa, desconto_percentual)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome,
        valor,
        valor,
        30,
        1,
        created.tenantId,
        tipoCobranca,
        1,
        tipoCobranca === 'RECORRENTE_CONTRATUAL' ? 1 : 0,
        1,
        1,
        0,
      ]
    );
    return result.lastID;
  }

  const result = await runExecute(
    'INSERT INTO plano (nome, valor_base, valor, duracao_em_dias, quantidade_max_pessoas, tenant_id) VALUES (?, ?, ?, ?, ?, ?)',
    [nome, valor, valor, 30, 1, created.tenantId]
  );
  return result.lastID;
}

async function createAluno(key, planoId) {
  const matriculaBase = Number(RUN_ID.slice(-9));
  const index = Object.keys(created.alunos).length + 1;
  const result = await runExecute(
    `INSERT INTO aluno
      (matricula, nome, status, dia_vencimento, plano_id, telefone, data_nascimento, tenant_id, unit_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      matriculaBase + index,
      `${PREFIX}${key}_${RUN_ID}`,
      'ativo',
      Number(isoDate(0).slice(-2)),
      planoId,
      '0000000000',
      '1990-01-01',
      created.tenantId,
      created.unitId,
    ]
  );
  created.alunos[key] = result.lastID;
}

async function createFixtures() {
  const tenant = await runExecute(
    'INSERT INTO tenant (nome, documento, status, created_at, updated_at) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
    [`${PREFIX}Tenant_${RUN_ID}`, `${PREFIX}DOC_${RUN_ID}`, 'ativo']
  );
  created.tenantId = tenant.lastID;

  const unit = await runExecute(
    'INSERT INTO unit (tenant_id, nome, codigo, status, is_matriz, created_at, updated_at) VALUES (?, ?, ?, ?, 1, datetime(\'now\'), datetime(\'now\'))',
    [created.tenantId, `${PREFIX}Unidade_${RUN_ID}`, `${PREFIX}UNIT_${RUN_ID}`, 'ativa']
  );
  created.unitId = unit.lastID;
  actor.tenant_id = created.tenantId;
  actor.unit_id = created.unitId;

  created.planoAvulsoId = await createPlan({
    nome: `${PREFIX}Plano_Avulso_${RUN_ID}`,
    valor: 123.45,
  });

  created.planoRecorrenteId = await createPlan({
    nome: `${PREFIX}Plano_Recorrente_${RUN_ID}`,
    valor: 150,
    tipoCobranca: 'RECORRENTE_CONTRATUAL',
  });
  created.unsupportedPlanAvailable = Boolean(created.planoRecorrenteId);
  if (!created.unsupportedPlanAvailable) {
    created.unsupportedScenarioSkipped = 'coluna plano.tipo_cobranca ausente no SQLite local';
  }

  await createAluno('SUCESSO', created.planoAvulsoId);
  await createAluno('PARCIAL', created.planoAvulsoId);
  await createAluno('ROLLBACK', created.planoAvulsoId);

  if (created.unsupportedPlanAvailable) {
    await createAluno('RECORRENTE', created.planoRecorrenteId);
  }
}

function createRouteApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.scope = { tenant_id: created.tenantId, unit_id: created.unitId };
    req.operator = {
      id: actor.id,
      nome: actor.name,
      login: actor.login,
      papel: actor.role,
      status: 'ativo',
    };
    next();
  });
  app.use('/planos', planosRouter);
  app.use(errorHandler);
  return app;
}

async function withRouteServer(callback) {
  const app = createRouteApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function previewContratacao(baseUrl, alunoKey, planoId, dataInicio = isoDate(0)) {
  const result = await postJson(`${baseUrl}/planos/preview-cobertura`, {
    aluno_id: created.alunos[alunoKey],
    plano_id: planoId,
    data_inicio: dataInicio,
  });
  if (result.status !== 200) {
    throw new Error(`preview status=${result.status}, code=${result.data?.code || 'ausente'}`);
  }
  return result.data;
}

async function contratarRenovar(baseUrl, alunoKey, planoId, valorPago, dataInicio = isoDate(0)) {
  return postJson(`${baseUrl}/planos/contratar-renovar`, {
    aluno_id: created.alunos[alunoKey],
    plano_id: planoId,
    data_inicio: dataInicio,
    valor_pago: valorPago,
    forma_pagamento: 'dinheiro',
    observacao: `${PREFIX}smoke transacional`,
  });
}

async function countFinancialRecords(alunoKey) {
  const alunoId = created.alunos[alunoKey];
  const mensalidade = await runGet(
    'SELECT COUNT(*) AS total FROM mensalidade WHERE aluno_id = ? AND tenant_id = ? AND unit_id = ?',
    [alunoId, created.tenantId, created.unitId]
  );
  const pagamento = await runGet(
    `SELECT COUNT(*) AS total
     FROM pagamento p
     JOIN mensalidade m ON m.id = p.mensalidade_id
     WHERE m.aluno_id = ? AND m.tenant_id = ? AND m.unit_id = ?`,
    [alunoId, created.tenantId, created.unitId]
  );
  const conta = await runGet(
    `SELECT COUNT(*) AS total
     FROM conta_financeira cf
     JOIN mensalidade m ON m.id = cf.origem_id AND cf.origem = 'mensalidade'
     WHERE m.aluno_id = ? AND m.tenant_id = ? AND m.unit_id = ?
       AND cf.deleted_at IS NULL`,
    [alunoId, created.tenantId, created.unitId]
  );

  return {
    mensalidades: mensalidade?.total || 0,
    pagamentos: pagamento?.total || 0,
    contasFinanceiras: conta?.total || 0,
  };
}

async function assertNoFinancialRecords(alunoKey) {
  const counts = await countFinancialRecords(alunoKey);
  if (counts.mensalidades || counts.pagamentos || counts.contasFinanceiras) {
    throw new Error(`registros vazaram: ${JSON.stringify(counts)}`);
  }
}

function assertCountsEqual(before, after) {
  for (const key of Object.keys(before)) {
    if (before[key] !== after[key]) {
      throw new Error(`contagem ${key}: antes=${before[key]}, depois=${after[key]}`);
    }
  }
}

async function assertSuccessPersistence(response, preview) {
  if (response.status !== 201 || response.data?.ok !== true) {
    throw new Error(`status=${response.status}, code=${response.data?.code || 'ausente'}`);
  }

  const mensalidadeId = response.data?.data?.mensalidade?.id;
  const pagamentoId = response.data?.data?.pagamento?.id;
  if (!mensalidadeId || !pagamentoId) {
    throw new Error('mensalidade/pagamento ausentes na resposta');
  }

  const mensalidade = await runGet(
    'SELECT * FROM mensalidade WHERE id = ? AND tenant_id = ? AND unit_id = ?',
    [mensalidadeId, created.tenantId, created.unitId]
  );
  if (!mensalidade) throw new Error('mensalidade nao encontrada no banco');
  if (mensalidade.status !== MENSALIDADE_STATUS.PAGO) {
    throw new Error(`mensalidade.status=${mensalidade.status}`);
  }
  if (!moneyEquals(mensalidade.valor_cobrado, preview.valor_cobrado)) {
    throw new Error(`mensalidade.valor_cobrado=${mensalidade.valor_cobrado}, esperado=${preview.valor_cobrado}`);
  }

  const pagamento = await runGet(
    'SELECT * FROM pagamento WHERE id = ? AND mensalidade_id = ? AND tenant_id = ? AND unit_id = ?',
    [pagamentoId, mensalidadeId, created.tenantId, created.unitId]
  );
  if (!pagamento) throw new Error('pagamento nao encontrado no banco');
  if (!moneyEquals(pagamento.valor_pago, preview.valor_cobrado)) {
    throw new Error(`pagamento.valor_pago=${pagamento.valor_pago}, esperado=${preview.valor_cobrado}`);
  }

  const contaFinanceira = await runGet(
    `SELECT *
     FROM conta_financeira
     WHERE origem = ? AND origem_id = ? AND tenant_id = ? AND unit_id = ? AND deleted_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    ['mensalidade', mensalidadeId, created.tenantId, created.unitId]
  );
  if (!contaFinanceira) throw new Error('conta_financeira derivada nao encontrada');
  if (contaFinanceira.status !== 'pago') throw new Error(`conta_financeira.status=${contaFinanceira.status}`);
  if (!moneyEquals(contaFinanceira.valor, preview.valor_cobrado)) {
    throw new Error(`conta_financeira.valor=${contaFinanceira.valor}, esperado=${preview.valor_cobrado}`);
  }

  const acesso = await AccessService.avaliarAcessoAluno(created.alunos.SUCESSO, {
    scope: { tenant_id: created.tenantId, unit_id: created.unitId },
  });
  if (!acesso.ok) {
    throw new Error(`acesso bloqueado: motivo=${acesso.motivo || 'ausente'}`);
  }
}

async function insertClosedCurrentPeriod() {
  const { ano, mes } = periodFromDate(isoDate(0));
  await runExecute(
    `INSERT INTO fechamento_mensal
      (ano, mes, status, inconsistencias_json, fechado_em, tenant_id, unit_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'), datetime('now'))`,
    [ano, mes, 'fechado', '[]', created.tenantId, created.unitId]
  );
}

async function runCase(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (error) {
    fail(label, error.message);
  }
}

async function run() {
  console.log('');
  console.log('== Smoke Test Cobertura - Sistema Academia SA ==');
  console.log('Fixtures: SMOKE_COBERTURA_*');
  console.log('');

  await cleanupFixtures();
  await createFixtures();

  await withRouteServer(async (baseUrl) => {
    await runCase('contratar/renovar com admin autorizado', async () => {
      const preview = await previewContratacao(baseUrl, 'SUCESSO', created.planoAvulsoId);
      const response = await contratarRenovar(baseUrl, 'SUCESSO', created.planoAvulsoId, preview.valor_cobrado);
      await assertSuccessPersistence(response, preview);
    });

    await runCase('bloquear cobertura paga sobreposta', async () => {
      const before = await countFinancialRecords('SUCESSO');
      const preview = await previewContratacao(baseUrl, 'SUCESSO', created.planoAvulsoId);
      const response = await contratarRenovar(baseUrl, 'SUCESSO', created.planoAvulsoId, preview.valor_cobrado);

      if (response.status !== 409 || response.data?.code !== 'COBERTURA_SOBREPOSTA') {
        throw new Error(`status=${response.status}, code=${response.data?.code || 'ausente'}`);
      }

      const after = await countFinancialRecords('SUCESSO');
      assertCountsEqual(before, after);
    });

    await runCase('permitir renovacao apos fim da cobertura atual', async () => {
      const atual = await runGet(
        `SELECT data_fim
         FROM mensalidade
         WHERE aluno_id = ? AND tenant_id = ? AND unit_id = ? AND status = ?
         ORDER BY DATE(data_fim) DESC, id DESC LIMIT 1`,
        [created.alunos.SUCESSO, created.tenantId, created.unitId, MENSALIDADE_STATUS.PAGO]
      );
      if (!atual?.data_fim) throw new Error('data_fim da cobertura atual ausente');

      const dataInicio = addDays(atual.data_fim, 1);
      const preview = await previewContratacao(baseUrl, 'SUCESSO', created.planoAvulsoId, dataInicio);
      const response = await contratarRenovar(baseUrl, 'SUCESSO', created.planoAvulsoId, preview.valor_cobrado, dataInicio);
      await assertSuccessPersistence(response, preview);
    });

    await runCase('rejeitar pagamento parcial', async () => {
      const preview = await previewContratacao(baseUrl, 'PARCIAL', created.planoAvulsoId);
      const response = await contratarRenovar(
        baseUrl,
        'PARCIAL',
        created.planoAvulsoId,
        Math.max(0.01, preview.valor_cobrado - 1)
      );

      if (response.status !== 400 || response.data?.code !== 'COBERTURA_CONTRATACAO_PAGAMENTO_INTEGRAL_OBRIGATORIO') {
        throw new Error(`status=${response.status}, code=${response.data?.code || 'ausente'}`);
      }
      await assertNoFinancialRecords('PARCIAL');
    });

    if (created.unsupportedPlanAvailable) {
      await runCase('rejeitar tipo de cobranca nao suportado', async () => {
        const preview = await previewContratacao(baseUrl, 'RECORRENTE', created.planoRecorrenteId);
        if (preview.tipo_cobranca !== 'RECORRENTE_CONTRATUAL') {
          throw new Error(`preview.tipo_cobranca=${preview.tipo_cobranca}`);
        }

        const response = await contratarRenovar(baseUrl, 'RECORRENTE', created.planoRecorrenteId, preview.valor_cobrado);
        if (response.status !== 400 || response.data?.code !== 'COBERTURA_CONTRATACAO_TIPO_NAO_SUPORTADO') {
          throw new Error(`status=${response.status}, code=${response.data?.code || 'ausente'}`);
        }
        await assertNoFinancialRecords('RECORRENTE');
      });
    } else {
      skip('rejeitar tipo de cobranca nao suportado', created.unsupportedScenarioSkipped);
    }

    await runCase('rollback basico em falha controlada', async () => {
      await insertClosedCurrentPeriod();
      const dataInicio = addMonths(isoDate(0), 1);
      const preview = await previewContratacao(baseUrl, 'ROLLBACK', created.planoAvulsoId, dataInicio);
      const response = await contratarRenovar(baseUrl, 'ROLLBACK', created.planoAvulsoId, preview.valor_cobrado, dataInicio);

      if (response.status !== 423 || response.data?.code !== 'PERIODO_FECHADO') {
        throw new Error(`status=${response.status}, code=${response.data?.code || 'ausente'}`);
      }
      await assertNoFinancialRecords('ROLLBACK');
    });
  });
}

async function main() {
  try {
    await run();
  } catch (error) {
    fail('smoke cobertura', error.message);
  } finally {
    try {
      await cleanupFixtures();
    } catch (error) {
      fail('limpeza de fixtures', error.message);
    }

    db.close();
  }

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }

  console.log('');
  console.log('Smoke cobertura finalizado com sucesso.');
}

main();
