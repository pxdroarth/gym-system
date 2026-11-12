// Smoke A-06: edicao de conta financeira x fechamento mensal.
//
// Regra: ao editar uma conta financeira manual, o mes ORIGINAL do lancamento e
// o mes de DESTINO precisam estar abertos na unidade da operacao. Qualquer um
// fechado recusa a edicao (423 PERIODO_FECHADO) antes de gravar.
//
// Pre-requisitos: base DESCARTAVEL criada com `npm run db:seed:dev` e a API
// rodando sobre ela. O smoke cria contas "A06 ...", fecha e reabre o mes
// anterior na Matriz e na Filial (deixa os dois reabertos no fim).
//
// Uso:
//   node tests/scripts/smoke-a06-conta-fechamento.js --base-url=http://localhost:3001 --db=backend/academia.sqlite

const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const BASE = (args['base-url'] || process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DB_PATH = path.resolve(args.db || 'backend/academia.sqlite');
const PW = process.env.SEED_DEV_PASSWORD || 'dev12345';
const RUN = Date.now().toString(36);

const sqlite3 = require(require.resolve('sqlite3', { paths: [process.cwd(), path.join(__dirname, '..', '..')] }));
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
const q1 = (sql, p = []) => new Promise((ok, ko) => db.get(sql, p, (e, row) => (e ? ko(e) : ok(row))));

let total = 0;
let falhas = 0;
function check(label, cond, extra = '') {
  total += 1;
  if (!cond) falhas += 1;
  console.log(`${cond ? '[OK]     ' : '[FALHOU] '}${label}${extra !== '' ? ` - ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
}

async function req(method, p, { token, unit, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (unit) headers['X-Unit-Id'] = String(unit);
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch { json = null; }
  return { s: r.status, j: json, code: json?.code || null };
}

const ymd = (d) => d.toISOString().slice(0, 10);
const linha = (id) => q1('SELECT * FROM conta_financeira WHERE id = ?', [id]);
const nAuditoria = async () => (await q1('SELECT COUNT(*) AS n FROM audit_log')).n;

(async () => {
  const login = await req('POST', '/auth/login', { body: { login: 'owner', senha: PW } });
  if (login.s !== 200) throw new Error(`login owner: ${login.s}`);
  const token = login.j.data.token;
  const unidades = login.j.data.usuario.allowedUnits;
  const matriz = Number(unidades.find((u) => u.codigo === 'matriz').id);
  const filial = Number(unidades.find((u) => u.codigo === 'filial').id);

  // Datas: mes anterior (sera fechado) e mes corrente (aberto), em UTC ao meio-dia.
  const agora = new Date();
  const corrente = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 10, 12));
  const corrente2 = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 20, 12));
  const anterior = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 15, 12));
  const [anoAnt, mesAnt] = [anterior.getUTCFullYear(), anterior.getUTCMonth() + 1];

  async function criarConta(unit, data, descricao, valor = 100) {
    const r = await req('POST', '/contas-financeiras', {
      token, unit,
      body: { descricao: `A06 ${descricao} ${RUN}`, tipo: 'despesa', valor, data_lancamento: ymd(data), status: 'pendente' },
    });
    if (r.s !== 201) throw new Error(`setup conta ${descricao}: ${r.s} ${r.code}`);
    return r.j.id;
  }
  const corpo = (_id, data, valor, descricao) => ({ descricao: `A06 ${descricao} ${RUN}`, tipo: 'despesa', valor, data_lancamento: ymd(data), status: 'pendente' });

  async function recusa(label, unit, id, novoCorpo) {
    const antes = await linha(id);
    const aud0 = await nAuditoria();
    const r = await req('PUT', `/contas-financeiras/${id}`, { token, unit, body: novoCorpo });
    const depois = await linha(id);
    const aud1 = await nAuditoria();
    check(`${label} -> 423 PERIODO_FECHADO`, r.s === 423 && r.code === 'PERIODO_FECHADO', `${r.s} ${r.code || ''} ${r.j?.error || ''}`);
    check(`${label}: lancamento intacto (todos os campos) e sem auditoria nova`,
      JSON.stringify(antes) === JSON.stringify(depois) && aud0 === aud1,
      JSON.stringify(antes) === JSON.stringify(depois) ? `auditoria ${aud0}->${aud1}` : `antes=${JSON.stringify(antes)} depois=${JSON.stringify(depois)}`);
  }

  async function aceita(label, unit, id, novoCorpo) {
    const r = await req('PUT', `/contas-financeiras/${id}`, { token, unit, body: novoCorpo });
    const depois = await linha(id);
    check(`${label} -> 200`, r.s === 200, `${r.s} ${r.code || ''}`);
    check(`${label}: data e valor gravados`,
      depois.data_lancamento === novoCorpo.data_lancamento && Number(depois.valor) === Number(novoCorpo.valor),
      `data=${depois.data_lancamento} valor=${depois.valor}`);
  }

  // ---------- setup: contas criadas com os dois meses abertos ----------
  const cOrigemFechada = await criarConta(matriz, anterior, 'origem no mes anterior');
  const cDestinoFechado = await criarConta(matriz, corrente, 'destino no mes anterior');
  const cAbertoAberto = await criarConta(matriz, corrente, 'aberto para aberto');
  const cFilial = await criarConta(filial, anterior, 'filial mes anterior');

  let r = await req('POST', `/fechamento-mensal/${anoAnt}/${mesAnt}/fechar`, { token, unit: matriz });
  check(`setup: ${mesAnt}/${anoAnt} fechado na Matriz`, r.s === 200 && String(r.j?.fechamento?.status).startsWith('fechado'), `${r.s} ${r.j?.fechamento?.status}`);

  // ---------- fechado -> aberto ----------
  await recusa(`fechado -> aberto: conta de ${mesAnt}/${anoAnt} movida para o mes corrente`, matriz, cOrigemFechada,
    corpo(cOrigemFechada, corrente, 999, 'movida'));
  // ---------- aberto -> fechado ----------
  await recusa(`aberto -> fechado: conta do mes corrente movida para ${mesAnt}/${anoAnt}`, matriz, cDestinoFechado,
    corpo(cDestinoFechado, anterior, 999, 'movida'));
  // ---------- fechado -> fechado (mesma data, so o valor) ----------
  await recusa('fechado -> fechado: so o valor muda, data no mes fechado', matriz, cOrigemFechada,
    corpo(cOrigemFechada, anterior, 555, 'valor'));
  // ---------- aberto -> aberto ----------
  await aceita('aberto -> aberto: mesma conta, outro dia do mes corrente e novo valor', matriz, cAbertoAberto,
    corpo(cAbertoAberto, corrente2, 250, 'editada'));

  // ---------- unidade da operacao ----------
  // Filial: mes anterior aberto (o fechamento e so da Matriz).
  await aceita(`Filial com ${mesAnt}/${anoAnt} aberto (fechado so na Matriz): conta da Filial movida para o mes corrente`, filial, cFilial,
    corpo(cFilial, corrente, 130, 'filial movida'));
  r = await req('POST', `/fechamento-mensal/${anoAnt}/${mesAnt}/reabrir`, { token, unit: matriz, body: { motivo: 'Conferencia no smoke L02' } });
  check('setup: Matriz reaberta', r.s === 200, r.s);
  r = await req('POST', `/fechamento-mensal/${anoAnt}/${mesAnt}/fechar`, { token, unit: filial });
  check(`setup: ${mesAnt}/${anoAnt} fechado so na Filial`, r.s === 200, r.s);
  await aceita(`Matriz com ${mesAnt}/${anoAnt} aberto (fechado so na Filial): fechado -> aberto agora passa`, matriz, cOrigemFechada,
    corpo(cOrigemFechada, corrente, 120, 'matriz movida'));
  await recusa(`Filial com ${mesAnt}/${anoAnt} fechado: conta da Filial volta para ${mesAnt}/${anoAnt}`, filial, cFilial,
    corpo(cFilial, anterior, 140, 'filial volta'));
  r = await req('POST', `/fechamento-mensal/${anoAnt}/${mesAnt}/reabrir`, { token, unit: filial, body: { motivo: 'Conferencia no smoke L02' } });
  check('setup: Filial reaberta (base volta ao estado aberto)', r.s === 200, r.s);

  console.log(`\n[smoke-a06] ${total - falhas}/${total} verificacoes OK`);
  db.close();
  process.exit(falhas ? 1 : 0);
})().catch((error) => {
  console.error('[ERRO]', error);
  db.close();
  process.exit(1);
});
