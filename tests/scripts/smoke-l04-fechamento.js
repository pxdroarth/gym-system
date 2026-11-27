// Smoke L04 · Fechamento mensal com conferencia por meio e ressalva (sublote D;
// decisao 6 de 16/11/2026 e decisoes de 27/11/2026).
//
// Base DESCARTAVEL criada com `npm run db:seed:dev` e a API rodando sobre ela.
// O smoke registra pagamentos, uma venda e baixas de contas no mes corrente da
// Matriz para conferir a soma por meio. Para a divergencia, grava um lancamento
// orfao direto no SQLite em 03/2032 (mes sem uso nos demais smokes), fecha com
// ressalva, reabre, remove o orfao e fecha de novo; ao final o mes fica reaberto.
//
// Uso:
//   node tests/scripts/smoke-l04-fechamento.js --base-url=http://localhost:3001 --db=backend/academia.sqlite
// Variaveis: SEED_DEV_PASSWORD (dev12345).

const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const BASE = (args['base-url'] || process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DB_PATH = path.resolve(args.db || 'backend/academia.sqlite');
const PW = process.env.SEED_DEV_PASSWORD || 'dev12345';
const RUN = Date.now().toString(36);

const sqlite3 = require(require.resolve('sqlite3', { paths: [process.cwd(), path.join(__dirname, '..', '..')] }));
const db = new sqlite3.Database(DB_PATH);
db.configure('busyTimeout', 5000);
const q1 = (sql, p = []) => new Promise((ok, ko) => db.get(sql, p, (e, r) => (e ? ko(e) : ok(r))));
const exec = (sql, p = []) => new Promise((ok, ko) => db.run(sql, p, function (e) { return e ? ko(e) : ok(this); }));

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
  return { s: r.status, j, code: j?.code || null, t };
}
async function login(l) {
  const r = await req('POST', '/auth/login', { body: { login: l, senha: PW } });
  if (r.s !== 200) throw new Error(`login ${l}: ${r.s} ${r.code}`);
  return { token: r.j.data.token, user: r.j.data.usuario, login: l };
}
const dado = (r) => r.j?.data || r.j;
const cent = (v) => Math.round(Number(v || 0) * 100);

(async () => {
  grupo('setup');
  const owner = await login('owner');
  const admin = await login('admin.academia');
  const financeiro = await login('financeiro');
  const recepcao = await login('recepcao');
  const matriz = Number(owner.user.allowedUnits.find((u) => u.codigo === 'matriz').id);
  const filial = Number(owner.user.allowedUnits.find((u) => u.codigo === 'filial').id);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const [ano, mes] = hoje.split('-').map(Number);
  const F = '/fechamento-mensal';
  const situacao = async (a = ano, m = mes, s = financeiro, unit = matriz) => req('GET', `${F}/${a}/${m}`, { s, unit });
  const meio = (conf, m) => conf.meios.find((x) => x.meio === m);

  // ===================================================================
  grupo('Conferencia por meio do mes corrente');
  let r = await situacao();
  check('financeiro consulta a situacao do mes -> 200', r.s === 200 && r.j.analise?.conferencia?.meios?.length === 6, `${r.s} ${r.code || ''}`);
  const antes = r.j.analise.conferencia;
  const filialAntes = (await situacao(ano, mes, owner, filial)).j.analise.conferencia;

  const planos = dado(await req('GET', '/planos', { s: owner, unit: matriz }));
  const plano = planos.find((p) => Number(p.duracao_em_dias) === 30 && !Number(p.compartilhado));
  const aluno = dado(await req('POST', '/alunos', { s: owner, unit: matriz, body: { nome: `L04D Aluno ${RUN}`, data_nascimento: '1990-01-01', plano_id: plano.id, dia_vencimento: 10, status: 'ativo' } }));
  const mens = dado(await req('POST', '/mensalidades', { s: owner, unit: matriz, body: { aluno_id: aluno.id, plano_id: plano.id, vencimento: hoje, valor_cobrado: 100 } }));
  const pPix = (await req('POST', '/pagamentos', { s: recepcao, unit: matriz, body: { mensalidade_id: mens.id, valor_pago: 30, forma_pagamento: 'pix' } })).j;
  await req('POST', '/pagamentos', { s: recepcao, unit: matriz, body: { mensalidade_id: mens.id, valor_pago: 20, forma_pagamento: 'cartao_debito' } });
  await req('POST', '/pagamentos', { s: recepcao, unit: matriz, body: { mensalidade_id: mens.id, valor_pago: 10 } });
  const fd = new FormData(); fd.append('nome', `L04D Produto ${RUN}`); fd.append('preco', '7.5'); fd.append('estoque', '10');
  const prod = await (await fetch(`${BASE}/produtos`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'X-Unit-Id': String(matriz) }, body: fd })).json();
  const venda = await req('POST', '/vendas-produtos', { s: recepcao, unit: matriz, body: { produto_id: prod.id, quantidade: 2, pagamentos: [{ meio: 'dinheiro', valor: 15 }] } });
  check('setup: venda de R$ 15 em dinheiro', venda.s === 201, `${venda.s} ${venda.code || ''}`);
  const conta = async (tipo, valor, meioBaixa) => req('POST', '/contas-financeiras', { s: financeiro, unit: matriz, body: { descricao: `L04D ${tipo} ${RUN}`, tipo, valor, data_lancamento: hoje, status: 'pago', ...(meioBaixa ? { meio_baixa: meioBaixa } : {}) } });
  await conta('receita', 40, 'transferencia');
  await conta('despesa', 25, 'pix');
  await conta('despesa', 12);
  const pid = pPix.pagamento?.id || pPix.id;
  const ped = (await req('POST', `/pagamentos/${pid}/estornos`, { s: recepcao, unit: matriz, body: { motivo: 'L04D' } })).j;
  await req('POST', `/pagamentos/estornos/${ped.id}/aprovar`, { s: admin, unit: matriz });
  const ex = await req('POST', `/pagamentos/estornos/${ped.id}/executar`, { s: financeiro, unit: matriz, body: { devolucoes: [{ meio: 'dinheiro', valor: 30 }], devolucao_confirmada: true, motivo_troca_meio: 'sem Pix no caixa', comprovante_referencia: 'recibo L04D' } });
  check('setup: estorno do Pix de R$ 30 devolvido em dinheiro', ex.s === 200, `${ex.s} ${ex.code || ''}`);

  r = await situacao();
  const depois = r.j.analise.conferencia;
  const delta = (m, campo) => cent(meio(depois, m)[campo]) - cent(meio(antes, m)[campo]);
  check('Pix: pagamento estornado nao conta como entrada; despesa de R$ 25 sai', delta('pix', 'mensalidades_entrada') === 0 && delta('pix', 'contas_saida') === 2500, [delta('pix', 'mensalidades_entrada'), delta('pix', 'contas_saida')]);
  check('Debito: R$ 20 de mensalidade', delta('cartao_debito', 'mensalidades_entrada') === 2000);
  check('Dinheiro: R$ 15 de venda entram e R$ 30 de devolucao saem', delta('dinheiro', 'vendas_entrada') === 1500 && delta('dinheiro', 'mensalidades_saida') === 3000, [delta('dinheiro', 'vendas_entrada'), delta('dinheiro', 'mensalidades_saida')]);
  check('Transferencia: R$ 40 de conta a receber', delta('transferencia', 'contas_entrada') === 4000);
  check('liquido por meio = entrada - saida', depois.meios.every((m) => cent(m.liquido) === cent(m.entrada) - cent(m.saida)));
  const somaLiq = depois.meios.reduce((s, m) => s + cent(m.liquido), 0);
  check('total liquido = soma dos meios', somaLiq === cent(depois.total.liquido), [somaLiq, depois.total.liquido]);
  check('sem meio registrado: +1 pagamento de R$ 10 e +1 conta de R$ 12',
    depois.sem_meio_registrado.mensalidades.quantidade === antes.sem_meio_registrado.mensalidades.quantidade + 1
    && cent(depois.sem_meio_registrado.mensalidades.valor) - cent(antes.sem_meio_registrado.mensalidades.valor) === 1000
    && depois.sem_meio_registrado.contas.quantidade === antes.sem_meio_registrado.contas.quantidade + 1, depois.sem_meio_registrado);
  const filialConf = (await situacao(ano, mes, owner, filial)).j.analise.conferencia;
  check('Filial nao soma movimentos da Matriz', JSON.stringify(filialConf) === JSON.stringify(filialAntes));

  // ===================================================================
  grupo('Divergencia bloqueia o fechamento');
  const [A, M] = [2032, 3];
  const unit = await q1('SELECT tenant_id FROM unit WHERE id = ?', [matriz]);
  const orfao = await exec(
    `INSERT INTO conta_financeira (descricao, tipo, valor, data_lancamento, status, origem, origem_id, tenant_id, unit_id, created_at, updated_at)
     VALUES (?, 'receita', 9.9, '2032-03-10', 'pago', 'venda_produto', 987654321, ?, ?, datetime('now'), datetime('now'))`,
    [`L04D orfao ${RUN}`, unit.tenant_id, matriz]
  );
  r = await situacao(A, M);
  const div = r.j.analise.inconsistencias;
  check('analise aponta o lancamento orfao com chave', div.length === 1 && div[0].tipo === 'lancamento_financeiro_orfao' && div[0].chave === `lancamento_financeiro_orfao:${orfao.lastID}`, div);
  r = await req('POST', `${F}/${A}/${M}/fechar`, { s: admin, unit: matriz });
  let row = await q1('SELECT * FROM fechamento_mensal WHERE ano = ? AND mes = ? AND unit_id = ?', [A, M, matriz]);
  check('fechar sem ressalva -> 409 FECHAMENTO_COM_DIVERGENCIA sem gravar', r.s === 409 && r.code === 'FECHAMENTO_COM_DIVERGENCIA' && !row, `${r.s} ${r.code || ''}`);
  const responsaveis = (await req('GET', `${F}/responsaveis`, { s: admin, unit: matriz })).j;
  check('responsaveis: contas com acesso ao Financeiro, sem a recepcao', responsaveis.some((u) => u.papel === 'financeiro') && !responsaveis.some((u) => u.papel === 'recepcao'), responsaveis.map((u) => u.papel));
  const base = { motivo: 'Lancamento de teste em conciliacao', evidencia: 'Chamado L04D', valor: 9.9, responsavel_id: financeiro.user.id };
  const recusas = [
    ['sem motivo', { ...base, motivo: '' }, 400, 'RESSALVA_MOTIVO_OBRIGATORIO'],
    ['sem evidencia', { ...base, evidencia: ' ' }, 400, 'RESSALVA_EVIDENCIA_OBRIGATORIA'],
    ['valor com tres casas', { ...base, valor: 1.234 }, 400, 'RESSALVA_VALOR_INVALIDO'],
    ['sem responsavel', { ...base, responsavel_id: null }, 400, 'RESSALVA_RESPONSAVEL_OBRIGATORIO'],
    ['responsavel sem acesso ao Financeiro (recepcao)', { ...base, responsavel_id: recepcao.user.id }, 422, 'RESSALVA_RESPONSAVEL_INVALIDO'],
  ];
  for (const [label, ressalva, status, code] of recusas) {
    r = await req('POST', `${F}/${A}/${M}/fechar`, { s: admin, unit: matriz, body: { ressalva } });
    row = await q1('SELECT id FROM fechamento_mensal WHERE ano = ? AND mes = ? AND unit_id = ?', [A, M, matriz]);
    check(`ressalva ${label} -> ${status} ${code} sem gravar`, r.s === status && r.code === code && !row, `${r.s} ${r.code || ''}`);
  }
  r = await req('POST', `${F}/${A}/${M}/fechar`, { s: financeiro, unit: matriz, body: { ressalva: base } });
  check('financeiro nao fecha -> 403', r.s === 403, `${r.s} ${r.code || ''}`);

  // ===================================================================
  grupo('Fechamento com ressalva');
  r = await req('POST', `${F}/${A}/${M}/fechar`, { s: admin, unit: matriz, body: { ressalva: base } });
  check('admin fecha com ressalva -> 200', r.s === 200 && r.j.fechamento?.status === 'fechado_com_inconsistencias', `${r.s} ${r.code || ''}`);
  const ress = r.j.fechamento?.ressalva;
  check('ressalva grava motivo, evidencia, valor, responsavel e divergencias', ress?.motivo === base.motivo && ress.evidencia === base.evidencia && ress.valor === 9.9
    && ress.responsavel?.id === String(financeiro.user.id) && ress.divergencias?.[0] === `lancamento_financeiro_orfao:${orfao.lastID}` && ress.registrada_por?.id === String(admin.user.id), ress);
  const aud = await q1("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'fechar_periodo_com_ressalva'");
  check('auditoria fechar_periodo_com_ressalva', aud.n >= 1);
  r = await req('POST', '/contas-financeiras', { s: financeiro, unit: matriz, body: { descricao: `L04D bloqueada ${RUN}`, tipo: 'despesa', valor: 5, data_lancamento: '2032-03-05', status: 'pendente' } });
  check('mes fechado com ressalva bloqueia lancamentos -> 423 PERIODO_FECHADO', r.s === 423 && r.code === 'PERIODO_FECHADO', `${r.s} ${r.code || ''}`);
  r = await situacao(A, M);
  check('situacao mostra o fechamento com a ressalva', r.j.fechamento?.status === 'fechado_com_inconsistencias' && r.j.fechamento.ressalva?.responsavel?.nome, r.j.fechamento?.status);
  r = await situacao(A, M, owner, filial);
  check('Filial: mes continua aberto', r.s === 200 && r.j.fechamento === null);
  r = await req('GET', F, { s: financeiro, unit: matriz });
  check('historico de fechamentos da unidade', r.s === 200 && r.j.some((f) => f.ano === A && f.mes === M), r.j?.length);

  // ===================================================================
  grupo('Reabertura e novo fechamento sem divergencia');
  r = await req('POST', `${F}/${A}/${M}/reabrir`, { s: admin, unit: matriz, body: { motivo: 'x' } });
  check('admin reabre -> 403', r.s === 403, `${r.s} ${r.code || ''}`);
  r = await req('POST', `${F}/${A}/${M}/reabrir`, { s: owner, unit: matriz, body: {} });
  check('dono sem motivo -> 400', r.s === 400 && r.code === 'MOTIVO_OBRIGATORIO', `${r.s} ${r.code || ''}`);
  r = await req('POST', `${F}/${A}/${M}/reabrir`, { s: owner, unit: matriz, body: { motivo: 'L04D: conciliacao concluida' } });
  check('dono reabre com motivo -> 200', r.s === 200, `${r.s} ${r.code || ''}`);
  await exec('DELETE FROM conta_financeira WHERE id = ?', [orfao.lastID]);
  r = await req('POST', `${F}/${A}/${M}/fechar`, { s: owner, unit: matriz, body: { ressalva: base } });
  check('sem divergencia fecha normal e ignora a ressalva', r.s === 200 && r.j.fechamento?.status === 'fechado' && r.j.fechamento.ressalva === null, `${r.s} ${r.j?.fechamento?.status}`);
  r = await req('POST', `${F}/${A}/${M}/reabrir`, { s: owner, unit: matriz, body: { motivo: 'L04D: limpeza do smoke' } });
  check('limpeza: mes reaberto', r.s === 200);

  // ===================================================================
  let ok = 0; let falhas = 0;
  console.log('\nResumo por grupo:');
  for (const [nome, x] of Object.entries(resultados)) {
    ok += x.ok; falhas += x.falhas;
    console.log(`  ${nome}: ${x.ok}/${x.ok + x.falhas}`);
  }
  db.close();
  console.log(`[smoke-l04-fechamento] ${ok}/${ok + falhas} verificacoes OK`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('[smoke-l04-fechamento] erro', e);
  process.exit(1);
});
