// Smoke L04 · Estorno de baixa de conta financeira (sublote C; decisoes de 20/11 e 26/11/2026).
//
// Base DESCARTAVEL criada com `npm run db:seed:dev` e a API rodando sobre ela.
// O smoke cria contas "L04C ..." na Matriz, da baixa, solicita, autoriza e
// executa estornos de baixa, fecha e reabre o mes corrente, liga e desliga a
// opcao de tres contas e le o SQLite somente para conferir os efeitos.
//
// Uso:
//   node tests/scripts/smoke-l04-estorno-baixa.js --base-url=http://localhost:3001 --db=backend/academia.sqlite
// Variaveis: SEED_DEV_PASSWORD (dev12345).

const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const BASE = (args['base-url'] || process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DB_PATH = path.resolve(args.db || 'backend/academia.sqlite');
const PW = process.env.SEED_DEV_PASSWORD || 'dev12345';
const RUN = Date.now().toString(36);

const sqlite3 = require(require.resolve('sqlite3', { paths: [process.cwd(), path.join(__dirname, '..', '..')] }));
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
const q1 = (sql, p = []) => new Promise((ok, ko) => db.get(sql, p, (e, r) => (e ? ko(e) : ok(r))));

const resultados = {};
let atual = 'setup';
function grupo(nome) { atual = nome; resultados[nome] = resultados[nome] || { ok: 0, falhas: 0 }; console.log(`\n== ${nome}`); }
function check(label, cond, extra = '') {
  resultados[atual] = resultados[atual] || { ok: 0, falhas: 0 };
  if (cond) resultados[atual].ok += 1; else resultados[atual].falhas += 1;
  console.log(`${cond ? '[OK]     ' : '[FALHOU] '}${label}${extra !== '' ? ` - ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
}

async function req(method, p, { s, unit, body } = {}) {
  const headers = {};
  if (s) headers.Authorization = `Bearer ${s.token}`;
  if (unit) headers['X-Unit-Id'] = String(unit);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { j = null; }
  return { s: r.status, j, code: j?.code || null, t, h: r.headers };
}
async function login(l) {
  const r = await req('POST', '/auth/login', { body: { login: l, senha: PW } });
  if (r.s !== 200) throw new Error(`login ${l}: ${r.s} ${r.code}`);
  return { token: r.j.data.token, user: r.j.data.usuario, login: l };
}

async function foto(contaId) {
  const [c, e, a] = await Promise.all([
    q1('SELECT status, pago, data_baixa, data_baixa_estimada, baixa_meio, baixa_por FROM conta_financeira WHERE id = ?', [contaId]),
    q1('SELECT GROUP_CONCAT(id || \':\' || status) AS e FROM conta_baixa_estorno WHERE conta_id = ?', [contaId]),
    q1("SELECT COUNT(*) AS n FROM audit_log WHERE record_type = 'conta_baixa_estorno'"),
  ]);
  return JSON.stringify({ c, e: e.e, a: a.n });
}
async function semEfeito(label, contaId, chamada, status, codigo) {
  const antes = await foto(contaId);
  const r = await chamada();
  const depois = await foto(contaId);
  check(`${label} -> ${status}${codigo ? ` ${codigo}` : ''}`, r.s === status && (!codigo || r.code === codigo), `${r.s} ${r.code || ''} ${r.j?.error || ''}`.trim());
  check(`${label}: conta, estornos e auditoria intactos`, antes === depois, antes === depois ? '' : `antes=${antes} depois=${depois}`);
  return r;
}

(async () => {
  grupo('setup');
  const owner = await login('owner');
  const admin = await login('admin.academia');
  const gestor = await login('gestor');
  const financeiro = await login('financeiro');
  const recepcao = await login('recepcao');
  const matriz = Number(owner.user.allowedUnits.find((u) => u.codigo === 'matriz').id);
  const filial = Number(owner.user.allowedUnits.find((u) => u.codigo === 'filial').id);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const ontem = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - 86400000));
  const C = '/contas-financeiras';
  let seq = 0;
  async function conta(status = 'pendente', extra = {}) {
    seq += 1;
    const r = await req('POST', C, { s: financeiro, unit: matriz, body: { descricao: `L04C conta ${seq} ${RUN}`, tipo: 'despesa', valor: 150, data_lancamento: hoje, status, ...extra } });
    if (r.s !== 201) throw new Error(`conta: ${r.s} ${r.code} ${r.t}`);
    return r.j.id;
  }
  const baixar = (id, meio, s = financeiro) => req('PATCH', `${C}/${id}/status`, { s, unit: matriz, body: { status: 'pago', ...(meio ? { meio_baixa: meio } : {}) } });
  const solicitar = (s, id, motivo = 'Baixa lancada por engano', unit = matriz) => req('POST', `${C}/${id}/estornos-baixa`, { s, unit, body: { motivo } });
  const aprovar = (s, eid) => req('POST', `${C}/estornos-baixa/${eid}/aprovar`, { s, unit: matriz });
  const externa = (s, eid, body) => req('POST', `${C}/estornos-baixa/${eid}/autorizacao-externa`, { s, unit: matriz, body });
  const executar = (s, eid) => req('POST', `${C}/estornos-baixa/${eid}/executar`, { s, unit: matriz });
  const contaDb = (id) => q1('SELECT * FROM conta_financeira WHERE id = ?', [id]);

  // ===================================================================
  grupo('Baixa grava data, responsavel e meio');
  const c1 = await conta();
  let r = await baixar(c1, 'cheque');
  check('meio invalido -> 400 BAIXA_MEIO_INVALIDO sem baixar', r.s === 400 && r.code === 'BAIXA_MEIO_INVALIDO' && (await contaDb(c1)).status === 'pendente', `${r.s} ${r.code}`);
  r = await baixar(c1, 'pix');
  let c = await contaDb(c1);
  check('baixa com Pix grava data local, meio e responsavel', r.s === 200 && c.status === 'pago' && c.data_baixa === hoje && c.baixa_meio === 'pix'
    && c.baixa_por === String(financeiro.user.id) && c.data_baixa_estimada === 0, c);
  const c2 = await conta('pago', { meio_baixa: 'boleto' });
  c = await contaDb(c2);
  check('conta criada ja paga grava a baixa', c.data_baixa === hoje && c.baixa_meio === 'boleto' && c.data_baixa_estimada === 0, c);
  const c3 = await conta();
  await baixar(c3);
  c = await contaDb(c3);
  check('baixa sem meio: meio nulo (opcional)', c.status === 'pago' && c.data_baixa === hoje && c.baixa_meio === null, c);
  const legado = await q1("SELECT COUNT(*) AS n, SUM(CASE WHEN data_baixa = substr(data_lancamento, 1, 10) AND data_baixa_estimada = 1 THEN 1 ELSE 0 END) AS est FROM conta_financeira WHERE origem = 'conta_financeira' AND status = 'pago' AND baixa_em IS NULL");
  check('contas pagas antes do sublote: data da conta como baixa estimada', legado.n > 0 && legado.n === legado.est, legado);
  await semEfeito('voltar conta paga a pendente pela rota comum', c1, () => req('PATCH', `${C}/${c1}/status`, { s: owner, unit: matriz, body: { status: 'pendente' } }), 409, 'REVERSAO_APROVACAO_NECESSARIA');

  // ===================================================================
  grupo('Solicitacao: papeis, pedido unico e recusas');
  for (const s of [recepcao, gestor]) {
    await semEfeito(`${s.login} solicita`, c1, () => solicitar(s, c1), 403);
  }
  const cPend = await conta();
  await semEfeito('conta pendente', cPend, () => solicitar(financeiro, cPend), 409, 'CONTA_NAO_BAIXADA');
  await semEfeito('sem motivo', c1, () => solicitar(financeiro, c1, ''), 400, 'MOTIVO_OBRIGATORIO');
  await semEfeito('conta da Matriz pela Filial', c1, () => solicitar(owner, c1, 'x', filial), 404, 'CONTA_NAO_ENCONTRADA');
  const derivada = await q1("SELECT id FROM conta_financeira WHERE origem != 'conta_financeira' AND status = 'pago' AND unit_id = ? AND deleted_at IS NULL LIMIT 1", [matriz]);
  if (derivada) {
    await semEfeito('lancamento derivado', derivada.id, () => solicitar(financeiro, derivada.id), 409, 'CONTA_FINANCEIRA_DERIVADA_PROTEGIDA');
  }
  r = await solicitar(financeiro, c1);
  check('financeiro solicita -> 201', r.s === 201 && r.j.status === 'solicitada' && r.j.data_baixa === hoje && r.j.baixa_meio === 'pix', `${r.s} ${r.code || ''}`);
  const e1 = r.j;
  r = await solicitar(admin, c1, 'outro motivo');
  check('reenvio devolve o pedido existente (200, Idempotent-Replayed)', r.s === 200 && r.j.id === e1.id && r.h.get('idempotent-replayed') === 'true' && r.j.motivo === e1.motivo, `${r.s} ${r.j?.id}`);
  const [s1, s2] = await Promise.all([solicitar(financeiro, c2, 'concorrente A'), solicitar(admin, c2, 'concorrente B')]);
  const ativos = await q1("SELECT COUNT(*) AS n FROM conta_baixa_estorno WHERE conta_id = ? AND status IN ('solicitada','aprovada')", [c2]);
  check('solicitacoes concorrentes: um unico pedido ativo', [s1.s, s2.s].sort().join() === '200,201' && ativos.n === 1, [s1.s, s2.s, ativos.n]);

  // ===================================================================
  grupo('Autorizacao');
  await semEfeito('executar sem aprovacao', c1, () => executar(financeiro, e1.id), 409, 'REVERSAO_APROVACAO_NECESSARIA');
  await semEfeito('financeiro aprova', c1, () => aprovar(financeiro, e1.id), 403);
  const ea = (await solicitar(admin, c3, 'admin pediu')).j;
  await semEfeito('admin aprova o proprio pedido', c3, () => aprovar(admin, ea.id), 403, 'AUTOAPROVACAO_PROIBIDA');
  const agora = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date()).replace(' ', 'T');
  await semEfeito('autorizacao externa anterior a baixa', c1, () => externa(financeiro, e1.id, { autorizador_id: owner.user.id, canal: 'whatsapp', autorizado_em: `${ontem}T10:00`, referencia: 'zap do dono' }), 400, 'DATA_AUTORIZACAO_INVALIDA');
  await semEfeito('registrador como autorizador', c1, () => externa(admin, e1.id, { autorizador_id: admin.user.id, canal: 'email', autorizado_em: agora, referencia: 'email' }), 403, 'AUTOAUTORIZACAO_PROIBIDA');
  await semEfeito('autorizador sem permissao (gestor)', c1, () => externa(financeiro, e1.id, { autorizador_id: gestor.user.id, canal: 'email', autorizado_em: agora, referencia: 'email' }), 422, 'AUTORIZADOR_SEM_PERMISSAO');
  r = await externa(financeiro, e1.id, { autorizador_id: owner.user.id, canal: 'whatsapp', autorizado_em: agora, referencia: 'WhatsApp do dono' });
  check('financeiro registra autorizacao externa do dono -> 200', r.s === 200 && r.j.status === 'aprovada' && r.j.autorizacao_canal === 'whatsapp' && r.j.aprovado_por === String(owner.user.id), `${r.s} ${r.code || ''}`);
  r = await aprovar(owner, ea.id);
  check('dono aprova pedido do admin -> 200', r.s === 200 && r.j.autorizacao_canal === 'sistema', `${r.s} ${r.code || ''}`);

  // ===================================================================
  grupo('Execucao: volta a pendente');
  r = await executar(financeiro, e1.id);
  c = await contaDb(c1);
  check('financeiro executa -> 200', r.s === 200 && r.j.estorno.status === 'executada', `${r.s} ${r.code || ''}`);
  check('conta volta a pendente sem dados de baixa e continua existindo', c.status === 'pendente' && c.pago === 0 && c.data_baixa === null && c.baixa_meio === null && c.deleted_at === null && c.reversao_controlada_id === null, c);
  const aud = await q1("SELECT metadata_json AS metadata FROM audit_log WHERE action = 'executar_estorno_baixa_conta' AND record_id = ? ORDER BY id DESC LIMIT 1", [e1.id]);
  const meta = JSON.parse(aud?.metadata || '{}');
  check('auditoria registra baixa original, autorizador externo e executor', meta.baixa?.data === hoje && meta.baixa?.meio === 'pix' && meta.autorizador?.canal === 'whatsapp' && meta.executor?.id === String(financeiro.user.id), meta.baixa);
  const lanc = await q1('SELECT COUNT(*) AS n FROM conta_financeira WHERE descricao LIKE ?', [`%conta financeira ${c1}%`]);
  check('sem lancamento inverso', lanc.n === 0, lanc.n);
  await semEfeito('repetir a execucao', c1, () => executar(financeiro, e1.id), 409, 'ESTORNO_JA_EXECUTADO');
  r = await executar(admin, ea.id);
  check('admin executa o pedido aprovado pelo dono -> 200', r.s === 200, `${r.s} ${r.code || ''}`);
  r = await baixar(c1, 'dinheiro');
  c = await contaDb(c1);
  check('nova baixa apos o estorno grava nova data e meio', r.s === 200 && c.status === 'pago' && c.baixa_meio === 'dinheiro' && c.data_baixa === hoje, c);
  r = await solicitar(financeiro, c1, 'segunda vez');
  check('nova solicitacao para a nova baixa -> 201', r.s === 201 && r.j.id !== e1.id, `${r.s} ${r.code || ''}`);

  // ===================================================================
  grupo('Periodo fechado e reabertura');
  const c5 = await conta('pago', { meio_baixa: 'pix' });
  const e5 = (await solicitar(financeiro, c5, 'antes do fechamento')).j;
  r = await aprovar(admin, e5.id);
  check('aprovado antes do fechamento', r.s === 200, `${r.s} ${r.code || ''}`);
  const [ano, mes] = hoje.split('-').map(Number);
  r = await req('POST', `/fechamento-mensal/${ano}/${mes}/fechar`, { s: owner, unit: matriz });
  check(`setup: ${mes}/${ano} fechado na Matriz`, r.s === 200, `${r.s} ${r.code || ''}`);
  await semEfeito('executar com o mes fechado', c5, () => executar(financeiro, e5.id), 423, 'PERIODO_FECHADO');
  check('aprovacao preservada apos a recusa', (await q1('SELECT status FROM conta_baixa_estorno WHERE id = ?', [e5.id])).status === 'aprovada');
  r = await req('POST', `/fechamento-mensal/${ano}/${mes}/reabrir`, { s: owner, unit: matriz, body: { motivo: 'L04C: estorno de baixa pendente' } });
  check('owner reabre o mes', r.s === 200, `${r.s} ${r.code || ''}`);
  r = await executar(financeiro, e5.id);
  check('nova tentativa apos reabertura -> 200', r.s === 200, `${r.s} ${r.code || ''}`);

  // ===================================================================
  grupo('Tres contas distintas');
  r = await req('PATCH', `${C}/estornos-baixa/politica`, { s: admin, unit: matriz, body: { contas_distintas: true } });
  check('admin configura a politica -> 403', r.s === 403, `${r.s} ${r.code || ''}`);
  r = await req('PATCH', `${C}/estornos-baixa/politica`, { s: owner, unit: matriz, body: { contas_distintas: true } });
  check('dono liga tres contas distintas', r.s === 200 && r.j.contas_distintas === true, `${r.s} ${r.code || ''}`);
  const c6 = await conta('pago');
  const e6 = (await solicitar(financeiro, c6)).j;
  await aprovar(owner, e6.id);
  await semEfeito('solicitante executa com tres contas', c6, () => executar(financeiro, e6.id), 403, 'CONTAS_DISTINTAS_EXIGIDAS');
  await semEfeito('autorizador executa com tres contas', c6, () => executar(owner, e6.id), 403, 'CONTAS_DISTINTAS_EXIGIDAS');
  r = await executar(admin, e6.id);
  check('terceira conta executa -> 200', r.s === 200 && r.j.estorno.contas_distintas_exigidas === 1, `${r.s} ${r.code || ''}`);
  r = await req('PATCH', `${C}/estornos-baixa/politica`, { s: owner, unit: matriz, body: { contas_distintas: false } });
  check('dono volta ao fluxo padrao', r.s === 200 && r.j.contas_distintas === false);

  // ===================================================================
  grupo('Fila do Financeiro');
  r = await req('GET', `${C}/estornos-baixa?status=executada`, { s: financeiro, unit: matriz });
  check('fila por estado traz descricao da conta', r.s === 200 && r.j.some((e) => e.id === e1.id && e.conta_descricao?.startsWith('L04C')), r.j?.length);
  r = await req('GET', `${C}/estornos-baixa?conta_id=${c1}`, { s: owner, unit: matriz });
  check('filtro por conta', r.s === 200 && r.j.length === 2, r.j?.length);
  r = await req('GET', `${C}/estornos-baixa`, { s: owner, unit: filial });
  check('Filial nao ve a fila da Matriz', r.s === 200 && !r.j.some((e) => e.conta_id === c1), r.j?.length);
  r = await req('GET', `${C}/estornos-baixa/autorizadores`, { s: financeiro, unit: matriz });
  check('autorizadores: admin e dono, sem o operador', r.s === 200 && r.j.some((a) => String(a.id) === String(owner.user.id)) && r.j.every((a) => ['owner', 'admin'].includes(a.papel)), r.j?.map((a) => a.papel));

  // ===================================================================
  let ok = 0; let falhas = 0;
  console.log('\nResumo por grupo:');
  for (const [nome, x] of Object.entries(resultados)) {
    ok += x.ok; falhas += x.falhas;
    console.log(`  ${nome}: ${x.ok}/${x.ok + x.falhas}`);
  }
  db.close();
  console.log(`[smoke-l04-estorno-baixa] ${ok}/${ok + falhas} verificacoes OK`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('[smoke-l04-estorno-baixa] erro', e);
  process.exit(1);
});
