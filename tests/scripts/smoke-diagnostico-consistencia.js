const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

const PREFIX = 'SMOKE_DIAGNOSTICO_';
const RUN_ID = `${Date.now()}`;

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

function openWritableDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (error) => {
      if (error) reject(error);
      else resolve(db);
    });
  });
}

function closeDatabase(db) {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function createTenantAndUnit(db) {
  const tenant = await run(
    db,
    'INSERT INTO tenant (nome, documento, status, created_at, updated_at) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
    [`${PREFIX}Tenant_${RUN_ID}`, `${PREFIX}DOC_${RUN_ID}`, 'ativo']
  );

  const unit = await run(
    db,
    'INSERT INTO unit (tenant_id, nome, codigo, status, is_matriz, created_at, updated_at) VALUES (?, ?, ?, ?, 1, datetime(\'now\'), datetime(\'now\'))',
    [tenant.lastID, `${PREFIX}Unidade_${RUN_ID}`, `${PREFIX}UNIT_${RUN_ID}`, 'ativa']
  );

  return { tenantId: tenant.lastID, unitId: unit.lastID };
}

async function createPlan(db, scope, suffix, overrides = {}) {
  const payload = {
    nome: `${PREFIX}Plano_${suffix}_${RUN_ID}`,
    valor_base: 100,
    valor: 100,
    duracao_em_dias: 30,
    quantidade_max_pessoas: 1,
    tenant_id: scope.tenantId,
    tipo_cobranca: 'AVULSO_MENSAL',
    exige_pagamento_ato: 1,
    gera_divida_automatica: 0,
    gera_cobertura_apos_pagamento: 1,
    permite_renovacao_avulsa: 1,
    desconto_percentual: 0,
    ...overrides,
  };

  const result = await run(
    db,
    `INSERT INTO plano
      (nome, valor_base, valor, duracao_em_dias, quantidade_max_pessoas, tenant_id,
       tipo_cobranca, exige_pagamento_ato, gera_divida_automatica, gera_cobertura_apos_pagamento,
       permite_renovacao_avulsa, desconto_percentual)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.nome,
      payload.valor_base,
      payload.valor,
      payload.duracao_em_dias,
      payload.quantidade_max_pessoas,
      payload.tenant_id,
      payload.tipo_cobranca,
      payload.exige_pagamento_ato,
      payload.gera_divida_automatica,
      payload.gera_cobertura_apos_pagamento,
      payload.permite_renovacao_avulsa,
      payload.desconto_percentual,
    ]
  );

  return result.lastID;
}

async function createAluno(db, scope, suffix, planoId) {
  const matricula = Number(RUN_ID.slice(-8)) + suffix.charCodeAt(0);
  const result = await run(
    db,
    `INSERT INTO aluno
      (matricula, nome, status, dia_vencimento, plano_id, telefone, data_nascimento, tenant_id, unit_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      matricula,
      `${PREFIX}Aluno_${suffix}_${RUN_ID}`,
      'ativo',
      10,
      planoId,
      '0000000000',
      '1990-01-01',
      scope.tenantId,
      scope.unitId,
    ]
  );
  return result.lastID;
}

async function createMensalidade(db, scope, payload) {
  const result = await run(
    db,
    `INSERT INTO mensalidade
      (aluno_id, plano_id, valor_cobrado, desconto_aplicado, status, data_inicio, data_fim, vencimento, observacoes, tenant_id, unit_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.alunoId,
      payload.planoId,
      payload.valor || 100,
      payload.desconto || 0,
      payload.status || 'pago',
      payload.dataInicio,
      payload.dataFim,
      payload.vencimento || payload.dataFim,
      `${PREFIX}${payload.observacoes || 'fixture'}`,
      scope.tenantId,
      scope.unitId,
    ]
  );
  return result.lastID;
}

async function createPagamento(db, scope, mensalidadeId, valor = 100) {
  const result = await run(
    db,
    'INSERT INTO pagamento (mensalidade_id, data_pagamento, valor_pago, valor_previsto, tenant_id, unit_id) VALUES (?, ?, ?, ?, ?, ?)',
    [mensalidadeId, isoDate(0), valor, valor, scope.tenantId, scope.unitId]
  );
  return result.lastID;
}

async function createContaFinanceira(db, scope, mensalidadeId, valor = 100) {
  const result = await run(
    db,
    `INSERT INTO conta_financeira
      (descricao, tipo, valor, data_lancamento, status, plano_contas_id, origem, origem_id, tenant_id, unit_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [`${PREFIX}Mensalidade ${mensalidadeId}`, 'receita', valor, isoDate(0), 'pago', 1, 'mensalidade', mensalidadeId, scope.tenantId, scope.unitId]
  );
  return result.lastID;
}

async function seedInconsistencies(db) {
  const scope = await createTenantAndUnit(db);
  const planoAvulsoId = await createPlan(db, scope, 'AVULSO');

  const alunoSemPagamentoId = await createAluno(db, scope, 'A', planoAvulsoId);
  await createMensalidade(db, scope, {
    alunoId: alunoSemPagamentoId,
    planoId: planoAvulsoId,
    dataInicio: '2020-01-01',
    dataFim: '2020-01-30',
    vencimento: '2020-01-30',
    observacoes: 'mensalidade_paga_sem_pagamento',
  });

  const alunoSobrepostoId = await createAluno(db, scope, 'B', planoAvulsoId);
  const mensalidadeSobreposta1 = await createMensalidade(db, scope, {
    alunoId: alunoSobrepostoId,
    planoId: planoAvulsoId,
    dataInicio: isoDate(-5),
    dataFim: isoDate(25),
    vencimento: isoDate(25),
    observacoes: 'cobertura_paga_sobreposta_1',
  });
  const mensalidadeSobreposta2 = await createMensalidade(db, scope, {
    alunoId: alunoSobrepostoId,
    planoId: planoAvulsoId,
    dataInicio: isoDate(10),
    dataFim: isoDate(40),
    vencimento: isoDate(40),
    observacoes: 'cobertura_paga_sobreposta_2',
  });
  await createPagamento(db, scope, mensalidadeSobreposta1);
  await createPagamento(db, scope, mensalidadeSobreposta2);
  await createContaFinanceira(db, scope, mensalidadeSobreposta1);
  await createContaFinanceira(db, scope, mensalidadeSobreposta2);
  await createContaFinanceira(db, scope, mensalidadeSobreposta1);

  await createPlan(db, scope, 'POLITICA_INVALIDA', {
    tipo_cobranca: 'PACOTE_PRE_PAGO',
    gera_divida_automatica: 1,
    duracao_em_dias: 0,
  });
}

function runDiagnostic(tempDbPath) {
  const scriptPath = path.resolve(__dirname, 'diagnostico-consistencia.js');
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--db', tempDbPath, '--json-only', '--no-fail'],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(`diagnostico saiu com status=${result.status}; stderr=${result.stderr || 'vazio'}`);
  }

  return JSON.parse(result.stdout);
}

function findCheck(payload, id) {
  return payload.checks.find((check) => check.id === id);
}

function assertCheck(payload, id, criticidade) {
  const check = findCheck(payload, id);
  if (!check) throw new Error(`check ausente: ${id}`);
  if (check.total <= 0) throw new Error(`check ${id} nao acusou achado`);
  if (check.criticidade !== criticidade) {
    throw new Error(`check ${id} criticidade=${check.criticidade}, esperado=${criticidade}`);
  }
  ok(`${id} detectado (${check.total})`);
}

function assertRealDbUnchanged(before, after) {
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error('backend/academia.sqlite teve size/mtime alterado durante o smoke');
  }
}

async function main() {
  const realDbPath = path.resolve(__dirname, '../../backend/academia.sqlite');
  const beforeRealDb = fs.statSync(realDbPath);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-diagnostico-'));
  const tempDbPath = path.join(tempDir, `academia-${RUN_ID}.sqlite`);
  let db;

  console.log('');
  console.log('== Smoke Diagnostico Consistencia - Sistema Academia SA ==');
  console.log(`DB temporario: ${tempDbPath}`);
  console.log('');

  try {
    fs.copyFileSync(realDbPath, tempDbPath);
    ok('copia temporaria do SQLite real criada');

    db = await openWritableDatabase(tempDbPath);
    await seedInconsistencies(db);
    await closeDatabase(db);
    db = null;
    ok('fixtures inconsistentes inseridas apenas no banco temporario');

    const payload = runDiagnostic(tempDbPath);
    if (!payload?.resultado?.tem_bloqueio) {
      throw new Error('diagnostico nao marcou tem_bloqueio=true com achados criticos/altos');
    }
    ok('diagnostico reportou tem_bloqueio=true');

    assertCheck(payload, 'mensalidade_paga_sem_pagamento', 'critico');
    assertCheck(payload, 'cobertura_paga_sobreposta', 'critico');
    assertCheck(payload, 'plano_politica_inconsistente', 'alto');
    assertCheck(payload, 'conta_financeira_derivada_duplicada', 'alto');

    const afterRealDb = fs.statSync(realDbPath);
    assertRealDbUnchanged(beforeRealDb, afterRealDb);
    ok('banco real preservado');
  } catch (error) {
    fail('smoke diagnostico consistencia', error.message);
  } finally {
    try {
      await closeDatabase(db);
    } catch (error) {
      fail('fechamento do banco temporario', error.message);
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (!fs.existsSync(tempDir)) {
        ok('arquivos temporarios removidos');
      }
    } catch (error) {
      fail('limpeza de arquivos temporarios', `${error.message}; caminho=${tempDir}`);
    }
  }

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }

  console.log('');
  console.log('Smoke diagnostico consistencia finalizado com sucesso.');
}

main();
