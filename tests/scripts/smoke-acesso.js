const express = require('express');
const db = require('../../backend/database');
const { runGet, runQuery, runExecute } = require('../../backend/dbHelper');
const AccessService = require('../../backend/services/AccessService');
const acessosRouter = require('../../backend/routes/acessos');
const errorHandler = require('../../backend/middlewares/errorHandler');
const { MENSALIDADE_STATUS } = require('../../backend/constants/domainStates');

const PREFIX = 'SMOKE_ACESSO_';
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
  planoId: null,
  alunos: {},
};

function ok(message) {
  console.log(`[OK] ${message}`);
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

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

async function deleteByIds(table, ids) {
  if (!ids.length) return;
  await runExecute(`DELETE FROM ${table} WHERE id IN (${placeholders(ids)})`, ids);
}

async function cleanupFixtures() {
  const alunos = await runQuery('SELECT id FROM aluno WHERE nome LIKE ?', [`${PREFIX}%`]);
  const alunoIds = alunos.map((row) => row.id);

  let acessoIds = [];
  if (alunoIds.length) {
    const acessos = await runQuery(
      `SELECT id FROM acesso WHERE aluno_id IN (${placeholders(alunoIds)})`,
      alunoIds
    );
    acessoIds = acessos.map((row) => row.id);
  }

  if (acessoIds.length) {
    await runExecute(
      `DELETE FROM audit_log
       WHERE actor_id = ?
          OR actor_name LIKE ?
          OR (record_type = 'acesso' AND record_id IN (${placeholders(acessoIds)}))`,
      [actor.id, `${PREFIX}%`, ...acessoIds.map(String)]
    );
  } else {
    await runExecute('DELETE FROM audit_log WHERE actor_id = ? OR actor_name LIKE ?', [actor.id, `${PREFIX}%`]);
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

  const units = await runQuery('SELECT id FROM unit WHERE nome LIKE ? OR codigo LIKE ?', [`${PREFIX}%`, `${PREFIX}%`]);
  await deleteByIds('unit', units.map((row) => row.id));

  const tenants = await runQuery('SELECT id FROM tenant WHERE nome LIKE ? OR documento LIKE ?', [`${PREFIX}%`, `${PREFIX}%`]);
  await deleteByIds('tenant', tenants.map((row) => row.id));
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

  const plano = await runExecute(
    'INSERT INTO plano (nome, valor_base, valor, duracao_em_dias, quantidade_max_pessoas, tenant_id) VALUES (?, ?, ?, ?, ?, ?)',
    [`${PREFIX}Plano_${RUN_ID}`, 100, 100, 30, 1, created.tenantId]
  );
  created.planoId = plano.lastID;

  const cases = [
    'SEM_MENSALIDADE',
    'MENSALIDADE_VENCIDA',
    'PARCIAL_VENCIDA',
    'EM_ABERTO_NO_PRAZO',
    'VENCIMENTO_HOJE',
    'PAGO_REGULAR',
  ];

  const matriculaBase = Number(RUN_ID.slice(-9));
  for (let index = 0; index < cases.length; index += 1) {
    const key = cases[index];
    const aluno = await runExecute(
      `INSERT INTO aluno
        (matricula, nome, status, dia_vencimento, plano_id, telefone, data_nascimento, tenant_id, unit_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        matriculaBase + index + 1,
        `${PREFIX}${key}_${RUN_ID}`,
        'ativo',
        Number(isoDate(0).slice(-2)),
        created.planoId,
        '0000000000',
        '1990-01-01',
        created.tenantId,
        created.unitId,
      ]
    );
    created.alunos[key] = aluno.lastID;
  }

  await createMensalidade('MENSALIDADE_VENCIDA', MENSALIDADE_STATUS.VENCIDO, isoDate(-1));
  await createMensalidade('PARCIAL_VENCIDA', MENSALIDADE_STATUS.PARCIAL, isoDate(-1));
  await createMensalidade('EM_ABERTO_NO_PRAZO', MENSALIDADE_STATUS.EM_ABERTO, isoDate(5));
  await createMensalidade('VENCIMENTO_HOJE', MENSALIDADE_STATUS.EM_ABERTO, isoDate(0));
  await createMensalidade('PAGO_REGULAR', MENSALIDADE_STATUS.PAGO, isoDate(5));
}

async function createMensalidade(alunoKey, status, vencimento) {
  await runExecute(
    `INSERT INTO mensalidade
      (aluno_id, plano_id, valor_cobrado, desconto_aplicado, status, data_inicio, data_fim, vencimento, observacoes, tenant_id, unit_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      created.alunos[alunoKey],
      created.planoId,
      100,
      0,
      status,
      isoDate(-10),
      isoDate(20),
      vencimento,
      `${PREFIX}fixture`,
      created.tenantId,
      created.unitId,
    ]
  );
}

async function expectAccessCase(label, alunoKey, expectedOk, expectedReason = null) {
  const scope = { tenant_id: created.tenantId, unit_id: created.unitId };
  const result = await AccessService.avaliarAcessoAluno(created.alunos[alunoKey], { scope });

  if (Boolean(result.ok) !== expectedOk) {
    throw new Error(`ok=${result.ok}, esperado ${expectedOk}`);
  }

  if (expectedReason && result.motivo !== expectedReason) {
    throw new Error(`motivo=${result.motivo || 'null'}, esperado ${expectedReason}`);
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
  app.use('/acessos', acessosRouter);
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

async function requestJson(url, method) {
  const response = await fetch(url, { method });
  const data = await response.json();
  return { status: response.status, data };
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
  console.log('== Smoke Test Acesso - Sistema Academia SA ==');
  console.log('Fixtures: SMOKE_ACESSO_*');
  console.log('');

  await cleanupFixtures();
  await createFixtures();

  const scope = { tenant_id: created.tenantId, unit_id: created.unitId };

  await runCase('aluno sem mensalidade bloqueado', () =>
    expectAccessCase('aluno sem mensalidade bloqueado', 'SEM_MENSALIDADE', false, 'sem_mensalidade_registrada'));

  await runCase('mensalidade vencida bloqueada', () =>
    expectAccessCase('mensalidade vencida bloqueada', 'MENSALIDADE_VENCIDA', false, 'mensalidade_vencida'));

  await runCase('parcial vencida bloqueada', async () => {
    const result = await AccessService.avaliarAcessoAluno(created.alunos.PARCIAL_VENCIDA, { scope });
    if (result.ok || result.resultado !== 'negado') {
      throw new Error(`resultado=${result.resultado}, ok=${result.ok}`);
    }
  });

  await runCase('em aberto dentro do prazo bloqueado', () =>
    expectAccessCase('em aberto dentro do prazo bloqueado', 'EM_ABERTO_NO_PRAZO', false, 'sem_cobertura_paga_vigente'));

  await runCase('vencimento hoje bloqueado', () =>
    expectAccessCase('vencimento hoje bloqueado', 'VENCIMENTO_HOJE', false, 'sem_cobertura_paga_vigente'));

  await runCase('mensalidade paga liberada', () =>
    expectAccessCase('mensalidade paga liberada', 'PAGO_REGULAR', true));

  await withRouteServer(async (baseUrl) => {
    await runCase('POST comum nao burla regra', async () => {
      const result = await postJson(`${baseUrl}/acessos`, {
        aluno_id: created.alunos.SEM_MENSALIDADE,
        resultado: 'permitido',
      });
      if (result.status !== 201) throw new Error(`status=${result.status}`);
      if (result.data?.acesso?.resultado !== 'negado') {
        throw new Error(`resultado=${result.data?.acesso?.resultado || 'ausente'}`);
      }
      if (!['sem_mensalidade_registrada', 'sem_mensalidade_vigente'].includes(result.data?.acesso?.motivo_bloqueio)) {
        throw new Error(`motivo=${result.data?.acesso?.motivo_bloqueio || 'ausente'}`);
      }
    });
  });

  await runCase('liberacao manual sem motivo bloqueada', async () => {
    try {
      await AccessService.registrarTentativaAcesso(created.alunos.SEM_MENSALIDADE, {
        scope,
        liberacaoManual: true,
        motivo: '',
        operador: actor.name,
        actor,
      });
      throw new Error('liberacao manual sem motivo foi aceita');
    } catch (error) {
      if (error.code !== 'LIBERACAO_MANUAL_INVALIDA') throw error;
    }
  });

  await runCase('liberacao manual com motivo auditada', async () => {
    const result = await AccessService.registrarTentativaAcesso(created.alunos.SEM_MENSALIDADE, {
      scope,
      liberacaoManual: true,
      motivo: `${PREFIX}motivo tecnico`,
      operador: actor.name,
      actor,
    });

    if (result.acesso?.resultado !== 'permitido') {
      throw new Error(`resultado=${result.acesso?.resultado || 'ausente'}`);
    }

    if (result.avaliacao?.status !== 'liberado_manual') {
      throw new Error(`status=${result.avaliacao?.status || 'ausente'}`);
    }

    const audit = await runGet(
      'SELECT action FROM audit_log WHERE action = ? AND record_type = ? AND record_id = ? ORDER BY id DESC LIMIT 1',
      ['acesso_liberado_manual', 'acesso', String(result.acesso.id)]
    );

    if (audit?.action !== 'acesso_liberado_manual') {
      throw new Error('evento acesso_liberado_manual nao encontrado');
    }
  });

  await withRouteServer(async (baseUrl) => {
    await runCase('PUT acesso bloqueado', async () => {
      const result = await requestJson(`${baseUrl}/acessos/1`, 'PUT');
      if (result.status !== 403 || result.data?.code !== 'ACESSO_REGISTRO_IMUTAVEL') {
        throw new Error(`status=${result.status}, code=${result.data?.code || 'ausente'}`);
      }
    });

    await runCase('DELETE acesso bloqueado', async () => {
      const result = await requestJson(`${baseUrl}/acessos/1`, 'DELETE');
      if (result.status !== 403 || result.data?.code !== 'ACESSO_REGISTRO_IMUTAVEL') {
        throw new Error(`status=${result.status}, code=${result.data?.code || 'ausente'}`);
      }
    });
  });
}

async function main() {
  try {
    await run();
  } catch (error) {
    fail('smoke acesso', error.message);
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
  console.log('Smoke acesso finalizado com sucesso.');
}

main();
