// Smoke GS-07 P1: pagamentos parciais, saldo em centavos, idempotencia e
// estorno por pagamento.
//
// Pre-requisitos: backend rodando sobre uma base DESCARTAVEL criada com
// `npm run db:seed:dev`. O smoke cria um aluno "SMOKE P1 ..." e mensalidades.
//
// Uso:
//   node tests/scripts/smoke-p1-pagamentos.js [--base-url=http://localhost:3001] [--db=backend/academia.sqlite]
// Com --db, confere tambem lancamentos financeiros, reversao e auditoria
// diretamente na base (somente leitura).
//
// Cenario (pedido da GS-07 P1): mensalidade de R$ 80; paga 50 -> saldo 30;
// 31 recusado; paga 30 -> quitada; reenvio com a mesma chave nao duplica;
// estorno dos 30 -> parcial com 50 pagos e 30 em aberto na mesma competencia;
// usuario sem reversao:executar recebe 403 ao estornar.

const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const BASE = (args['base-url'] || process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DB_PATH = args.db ? path.resolve(args.db) : null;
const PW = process.env.SEED_DEV_PASSWORD || 'dev12345';
const RUN = Date.now().toString(36);

let falhas = 0;
let total = 0;
function check(label, cond, extra = '') {
  total += 1;
  if (!cond) falhas += 1;
  console.log(`${cond ? '[OK]     ' : '[FALHOU] '}${label}${extra ? ` - ${extra}` : ''}`);
}

async function req(method, p, { token, unit, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (unit) headers['X-Unit-Id'] = String(unit);
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  return { status: response.status, json, code: json?.code || null, headers: response.headers };
}

async function login(loginName) {
  const r = await req('POST', '/auth/login', { body: { login: loginName, senha: PW } });
  if (r.status !== 200) throw new Error(`login ${loginName} falhou: ${r.status} ${r.code}`);
  return { token: r.json.data.token, user: r.json.data.usuario };
}

function abrirDb() {
  if (!DB_PATH) return null;
  // sqlite3 do proprio projeto; somente leitura.
  const sqlite3 = require(require.resolve('sqlite3', { paths: [process.cwd(), path.join(__dirname, '..', '..')] }));
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
  return {
    all: (sql, params = []) => new Promise((ok, ko) => db.all(sql, params, (e, rows) => (e ? ko(e) : ok(rows)))),
    get: (sql, params = []) => new Promise((ok, ko) => db.get(sql, params, (e, row) => (e ? ko(e) : ok(row)))),
    close: () => db.close(),
  };
}

const unwrap = (r) => r.json?.data ?? r.json;

async function mensalidadeAtual(owner, unit, alunoId, mensalidadeId) {
  const r = await req('GET', `/mensalidades/aluno/${alunoId}?limite=100`, { token: owner.token, unit });
  const lista = r.json?.data || r.json?.mensalidades || r.json || [];
  return (Array.isArray(lista) ? lista : []).find((m) => Number(m.id) === Number(mensalidadeId)) || null;
}

async function pagamentosDoAluno(owner, unit, alunoId) {
  const r = await req('GET', `/pagamentos/aluno/${alunoId}`, { token: owner.token, unit });
  return Array.isArray(r.json) ? r.json : (r.json?.data || []);
}

(async () => {
  const owner = await login('owner');
  const recepcao = await login('recepcao');
  const unidades = owner.user.allowedUnits || [];
  const matriz = unidades.find((u) => u.codigo === 'matriz') || unidades[0];
  const filial = unidades.find((u) => u.codigo === 'filial');
  const unit = Number(matriz.id);

  // ---------- setup ----------
  const planos = await req('GET', '/planos', { token: owner.token, unit });
  const listaPlanos = planos.json?.data || planos.json || [];
  const plano = listaPlanos.find((p) => !p.deleted_at) || listaPlanos[0];
  check('setup: plano disponivel na Matriz', Boolean(plano?.id), `${planos.status}`);

  let r = await req('POST', '/alunos', {
    token: owner.token, unit,
    body: { nome: `SMOKE P1 ${RUN}`, data_nascimento: '1990-01-01', plano_id: plano.id, dia_vencimento: 10, status: 'ativo' },
  });
  const aluno = unwrap(r);
  check('setup: aluno criado', r.status === 201 && aluno?.id, `${r.status} ${r.code || ''}`);

  const hoje = new Date().toISOString().slice(0, 10);
  const vencimento = `${hoje.slice(0, 7)}-10`;
  r = await req('POST', '/mensalidades', {
    token: owner.token, unit,
    body: { aluno_id: aluno.id, plano_id: plano.id, vencimento, valor_cobrado: 80 },
  });
  const mensalidade = unwrap(r);
  check('setup: mensalidade de R$ 80 criada', r.status === 201 && Number(mensalidade?.valor_cobrado) === 80,
    `${r.status} ${r.code || ''} valor=${mensalidade?.valor_cobrado}`);
  const competencia = { vencimento: mensalidade.vencimento, data_inicio: mensalidade.data_inicio, data_fim: mensalidade.data_fim };
  const base = { mensalidade_id: mensalidade.id, data_pagamento: hoje, forma_pagamento: 'dinheiro' };

  // ---------- 1. paga 50 ----------
  r = await req('POST', '/pagamentos', { token: owner.token, unit, key: `smoke-p1-${RUN}-a`, body: { ...base, valor_pago: 50 } });
  const p50 = r.json;
  check('R$ 50: 201, mensalidade parcial', r.status === 201 && p50?.status_mensalidade === 'parcial', `${r.status} ${r.code || p50?.status_mensalidade}`);
  check('R$ 50: total pago 50 e saldo 30', p50?.total_pago === 50 && p50?.saldo_em_aberto === 30, `pago=${p50?.total_pago} saldo=${p50?.saldo_em_aberto}`);
  let m = await mensalidadeAtual(owner, unit, aluno.id, mensalidade.id);
  check('listagem mostra saldo_em_aberto 30', Number(m?.saldo_em_aberto) === 30 && Number(m?.total_pago) === 50,
    `saldo=${m?.saldo_em_aberto} pago=${m?.total_pago}`);

  // ---------- 2. 31 acima do saldo ----------
  r = await req('POST', '/pagamentos', { token: owner.token, unit, key: `smoke-p1-${RUN}-b`, body: { ...base, valor_pago: 31 } });
  check('R$ 31: recusado com 422 PAGAMENTO_ACIMA_DO_SALDO', r.status === 422 && r.code === 'PAGAMENTO_ACIMA_DO_SALDO', `${r.status} ${r.code}`);
  check('R$ 31: resposta informa saldo 30', Number(r.json?.details?.saldo_em_aberto ?? r.json?.saldo_em_aberto) === 30, JSON.stringify(r.json?.details || {}));
  r = await req('POST', '/pagamentos', { token: owner.token, unit, body: { ...base, valor_pago: 30.001 } });
  check('R$ 30,001: recusado (mais de 2 casas)', r.status === 400 && r.code === 'VALOR_PAGO_INVALIDO', `${r.status} ${r.code}`);
  let pags = await pagamentosDoAluno(owner, unit, aluno.id);
  check('recusas nao gravaram pagamento (1 registro)', pags.length === 1, `${pags.length}`);

  // ---------- 3. paga 30 ----------
  const chave30 = `smoke-p1-${RUN}-c`;
  const corpo30 = { ...base, valor_pago: 30 };
  r = await req('POST', '/pagamentos', { token: owner.token, unit, key: chave30, body: corpo30 });
  const p30 = r.json;
  check('R$ 30: 201, mensalidade paga', r.status === 201 && p30?.status_mensalidade === 'pago', `${r.status} ${r.code || p30?.status_mensalidade}`);
  check('R$ 30: total pago 80 e saldo 0', p30?.total_pago === 80 && p30?.saldo_em_aberto === 0, `pago=${p30?.total_pago} saldo=${p30?.saldo_em_aberto}`);

  // ---------- 4. reenvio identico ----------
  r = await req('POST', '/pagamentos', { token: owner.token, unit, key: chave30, body: corpo30 });
  check('reenvio mesma chave: 200 com o resultado original', r.status === 200 && r.json?.id === p30?.id && r.json?.idempotente === true
    && r.json?.status_mensalidade === 'pago', `${r.status} id=${r.json?.id}/${p30?.id}`);
  check('reenvio: header Idempotent-Replayed', r.headers.get('idempotent-replayed') === 'true');
  r = await req('POST', '/pagamentos', { token: owner.token, unit, body: { ...corpo30, chave_idempotencia: chave30 } });
  check('reenvio com a chave no corpo: mesmo resultado', r.status === 200 && r.json?.id === p30?.id, `${r.status} ${r.code || ''}`);
  pags = await pagamentosDoAluno(owner, unit, aluno.id);
  check('reenvio nao criou pagamento (2 registros)', pags.length === 2, `${pags.length}`);
  r = await req('POST', '/pagamentos', { token: owner.token, unit, key: chave30, body: { ...corpo30, valor_pago: 20 } });
  check('mesma chave com dados diferentes: 409 IDEMPOTENCIA_CONFLITO', r.status === 409 && r.code === 'IDEMPOTENCIA_CONFLITO', `${r.status} ${r.code}`);
  r = await req('POST', '/pagamentos', { token: owner.token, unit, key: `smoke-p1-${RUN}-d`, body: { ...base, valor_pago: 1 } });
  check('chave nova em mensalidade quitada: 409 MENSALIDADE_QUITADA', r.status === 409 && r.code === 'MENSALIDADE_QUITADA', `${r.status} ${r.code}`);

  // ---------- 5. estorno: permissao, escopo, motivo ----------
  r = await req('POST', `/pagamentos/${p30.id}/estornar`, { token: recepcao.token, unit, body: { motivo: 'teste sem permissao' } });
  check('recepcao (sem reversao:executar) estorna -> 403', r.status === 403, `${r.status} ${r.code}`);
  if (filial) {
    r = await req('POST', `/pagamentos/${p30.id}/estornar`, { token: owner.token, unit: filial.id, body: { motivo: 'outra unidade' } });
    check('owner na Filial estorna pagamento da Matriz -> 404', r.status === 404 && r.code === 'PAGAMENTO_NAO_ENCONTRADO', `${r.status} ${r.code}`);
  }
  r = await req('POST', `/pagamentos/${p30.id}/estornar`, { token: owner.token, unit, body: {} });
  check('estorno sem motivo -> 400 MOTIVO_OBRIGATORIO', r.status === 400 && r.code === 'MOTIVO_OBRIGATORIO', `${r.status} ${r.code}`);
  r = await req('POST', `/reversoes/mensalidades/${mensalidade.id}`, { token: owner.token, unit, body: { motivo: 'em bloco' } });
  check('reversao em bloco de mensalidade com pagamentos novos -> 409', r.status === 409 && r.code === 'USAR_ESTORNO_POR_PAGAMENTO', `${r.status} ${r.code}`);
  pags = await pagamentosDoAluno(owner, unit, aluno.id);
  check('tentativas recusadas nao estornaram nada', pags.every((p) => !p.estornado_em), JSON.stringify(pags.map((p) => p.estornado_em)));

  // ---------- 6. estorno dos 30 ----------
  r = await req('POST', `/pagamentos/${p30.id}/estornar`, { token: owner.token, unit, body: { motivo: 'smoke P1: estorno do pagamento de 30' } });
  const est = r.json;
  check('estorno dos R$ 30: 200, mensalidade volta a parcial', r.status === 200 && est?.status_mensalidade === 'parcial', `${r.status} ${r.code || est?.status_mensalidade}`);
  check('estorno: 50 pagos e 30 em aberto', est?.total_pago === 50 && est?.saldo_em_aberto === 30, `pago=${est?.total_pago} saldo=${est?.saldo_em_aberto}`);
  m = await mensalidadeAtual(owner, unit, aluno.id, mensalidade.id);
  check('mesma competencia (vencimento, inicio e fim inalterados)',
    m && m.vencimento === competencia.vencimento && m.data_inicio === competencia.data_inicio && m.data_fim === competencia.data_fim,
    JSON.stringify({ antes: competencia, depois: m && { vencimento: m.vencimento, data_inicio: m.data_inicio, data_fim: m.data_fim } }));
  check('listagem: status parcial, saldo 30', m?.status === 'parcial' && Number(m?.saldo_em_aberto) === 30, `${m?.status} ${m?.saldo_em_aberto}`);
  pags = await pagamentosDoAluno(owner, unit, aluno.id);
  const pg50 = pags.find((p) => p.id === p50.id);
  const pg30 = pags.find((p) => p.id === p30.id);
  check('somente o pagamento selecionado foi estornado', Boolean(pg30?.estornado_em) && !pg50?.estornado_em && pags.length === 2,
    `30=${pg30?.estornado_em} 50=${pg50?.estornado_em}`);
  r = await req('POST', `/pagamentos/${p30.id}/estornar`, { token: owner.token, unit, body: { motivo: 'de novo' } });
  check('estornar de novo -> 409 PAGAMENTO_JA_ESTORNADO', r.status === 409 && r.code === 'PAGAMENTO_JA_ESTORNADO', `${r.status} ${r.code}`);
  r = await req('POST', '/pagamentos', { token: owner.token, unit, key: chave30, body: corpo30 });
  pags = await pagamentosDoAluno(owner, unit, aluno.id);
  check('reenvio da chave dos 30 apos estorno: original, sem novo pagamento', r.status === 200 && r.json?.id === p30.id && pags.length === 2,
    `${r.status} pagamentos=${pags.length}`);

  // ---------- 7. base: lancamentos, reversao e auditoria ----------
  const db = abrirDb();
  if (db) {
    const lanc = await db.all(
      `SELECT id, tipo, valor, status, origem, origem_id FROM conta_financeira
       WHERE deleted_at IS NULL AND (
         (origem = 'pagamento_mensalidade' AND origem_id IN (?, ?))
         OR (origem = 'mensalidade' AND origem_id = ?)
         OR (origem = 'reversao_controlada' AND origem_id = ?)
       )`,
      [p50.id, p30.id, mensalidade.id, est?.reversao?.id || -1]
    );
    const porPagamento = lanc.filter((l) => l.origem === 'pagamento_mensalidade');
    const inversos = lanc.filter((l) => l.origem === 'reversao_controlada');
    const agregadoPendente = lanc.filter((l) => l.origem === 'mensalidade');
    check('um lancamento por pagamento (50 e 30), sem duplicar no reenvio', porPagamento.length === 2
      && porPagamento.map((l) => Number(l.valor)).sort((a, b) => a - b).join(',') === '30,50', JSON.stringify(porPagamento));
    check('estorno gerou lancamento inverso (despesa de 30)', inversos.length === 1 && inversos[0].tipo === 'despesa' && Number(inversos[0].valor) === 30,
      JSON.stringify(inversos));
    check('a receber agregado baixado (sem receita em dobro)', agregadoPendente.length === 0, JSON.stringify(agregadoPendente));
    const liquido = lanc.reduce((acc, l) => acc + (l.tipo === 'receita' ? 1 : -1) * Math.round(Number(l.valor) * 100), 0);
    check('efeito financeiro liquido = R$ 50', liquido === 5000, `${liquido / 100}`);
    const aud = await db.all(
      `SELECT action FROM audit_log WHERE (module = 'pagamentos' AND record_id = ?) OR (module = 'mensalidades' AND record_id = ?)`,
      [String(p30.id), String(mensalidade.id)]
    ).catch(async () => db.all(
      `SELECT action FROM audit_logs WHERE (module = 'pagamentos' AND record_id = ?) OR (module = 'mensalidades' AND record_id = ?)`,
      [String(p30.id), String(mensalidade.id)]
    ));
    const acoes = aud.map((a) => a.action);
    check('auditoria: estorno registrado', acoes.includes('estornar_pagamento_mensalidade'), acoes.join(','));
    check('auditoria: 2 pagamentos registrados (reenvio nao audita de novo)',
      acoes.filter((a) => a === 'registrar_pagamento_mensalidade').length === 2, acoes.join(','));
    const rev = await db.get('SELECT modulo, tipo, registro_origem_id, motivo, lancamento_inverso_id FROM reversao_controlada WHERE id = ?', [est?.reversao?.id || -1]);
    check('reversao_controlada aponta para o pagamento', rev && rev.tipo === 'pagamento_mensalidade' && String(rev.registro_origem_id) === String(p30.id)
      && rev.lancamento_inverso_id, JSON.stringify(rev));
    db.close();
  } else {
    console.log('[--]     conferencias na base puladas (use --db=backend/academia.sqlite)');
  }

  // ---------- 8. reabre e quita de novo ----------
  r = await req('POST', '/pagamentos', { token: owner.token, unit, key: `smoke-p1-${RUN}-e`, body: { ...base, valor_pago: 30 } });
  check('apos estorno, novo pagamento de 30 quita de novo', r.status === 201 && r.json?.status_mensalidade === 'pago' && r.json?.saldo_em_aberto === 0,
    `${r.status} ${r.code || r.json?.status_mensalidade}`);

  // ---------- 9. concorrencia ----------
  // Duas requisicoes simultaneas de R$ 30 com chaves diferentes sobre saldo 30:
  // so uma pode ser aceita. A mesma chave enviada em paralelo cria um unico pagamento.
  async function novaMensalidade80(sufixo) {
    const ra = await req('POST', '/alunos', {
      token: owner.token, unit,
      body: { nome: `SMOKE P1 ${RUN} ${sufixo}`, data_nascimento: '1990-01-01', plano_id: plano.id, dia_vencimento: 10, status: 'ativo' },
    });
    const al = unwrap(ra);
    const rm = await req('POST', '/mensalidades', {
      token: owner.token, unit,
      body: { aluno_id: al?.id, plano_id: plano.id, vencimento, valor_cobrado: 80 },
    });
    const mm = unwrap(rm);
    check(`setup concorrencia ${sufixo}: aluno e mensalidade de R$ 80`, ra.status === 201 && rm.status === 201, `${ra.status} ${rm.status} ${rm.code || ''}`);
    return { aluno: al, mensalidade: mm };
  }
  const c2 = await novaMensalidade80('A');
  const m2 = c2.mensalidade;
  await req('POST', '/pagamentos', { token: owner.token, unit, key: `smoke-p1-${RUN}-f`, body: { ...base, mensalidade_id: m2.id, valor_pago: 50 } });
  const paralelas = await Promise.all([
    req('POST', '/pagamentos', { token: owner.token, unit, key: `smoke-p1-${RUN}-g1`, body: { ...base, mensalidade_id: m2.id, valor_pago: 30 } }),
    req('POST', '/pagamentos', { token: owner.token, unit, key: `smoke-p1-${RUN}-g2`, body: { ...base, mensalidade_id: m2.id, valor_pago: 30 } }),
  ]);
  const aceitas = paralelas.filter((x) => x.status === 201).length;
  const recusadas = paralelas.filter((x) => x.status === 409 || x.status === 422).length;
  check('concorrencia: 2 x R$ 30 em paralelo sobre saldo 30 -> 1 aceita, 1 recusada', aceitas === 1 && recusadas === 1,
    paralelas.map((x) => `${x.status} ${x.code || ''}`).join(' | '));
  const c3 = await novaMensalidade80('B');
  const m3 = c3.mensalidade;
  const mesmaChave = `smoke-p1-${RUN}-h`;
  const dup = await Promise.all([1, 2, 3].map(() => req('POST', '/pagamentos', {
    token: owner.token, unit, key: mesmaChave, body: { ...base, mensalidade_id: m3.id, valor_pago: 20 },
  })));
  const idsDup = new Set(dup.map((x) => x.json?.id));
  m = await mensalidadeAtual(owner, unit, c3.aluno.id, m3.id);
  check('concorrencia: mesma chave 3x em paralelo -> 1 pagamento (201 + 200 + 200)',
    idsDup.size === 1 && dup.filter((x) => x.status === 201).length === 1 && dup.filter((x) => x.status === 200).length === 2
      && Number(m?.total_pago) === 20,
    `${dup.map((x) => x.status).join(',')} total_pago=${m?.total_pago}`);

  console.log(`\n${total - falhas}/${total} verificacoes OK`);
  process.exit(falhas ? 1 : 0);
})().catch((error) => {
  console.error('[ERRO]', error);
  process.exit(1);
});
