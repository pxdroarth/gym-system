// Smoke S1 · Financeiro: isolamento entre Redes e autorizacao do modulo.
//
// Cria duas academias ficticias pelo onboarding (Alfa e Beta), cada uma com
// UMA unidade, e verifica pela API:
//   R1 isolamento: listagens so com dados proprios; unidade da outra Rede no
//      X-Unit-Id -> 403; registro da outra Rede pelo ID, na unidade propria -> 404
//      e sem efeito;
//   R2 acesso ao modulo Financeiro: sem sessao -> 401; recepcao, gestor e
//      operador -> 403 em dashboard/indicadores, contas, plano de contas,
//      ativos, orcamento e fechamento (com aliases); recepcao segue consultando
//      alunos e registrando entrada;
//   R3 categoria: conta com plano de contas de outra Rede recusada sem gravar;
//      categoria propria funciona; nome so aparece se a categoria for da Rede do
//      lancamento (inclusive registro antigo); lancamentos automaticos e
//      contrapartidas sem categoria valida ficam sem categoria, com valor e
//      origem preservados;
//   R4 estorno e fechamento: recepcao 403 ao estornar; financeiro recebe 409
//      no estorno direto e 403 para fechar/reabrir; owner reabre com motivo;
//      negativas preservam pagamento e fechamento.
//
// Pre-requisitos: base DESCARTAVEL (`npm run db:seed:dev`) e a API rodando sobre
// ela. Para simular um registro antigo (R3), o smoke grava UMA linha direto na
// base, por isso use apenas base descartavel.
//
// Uso:
//   node tests/scripts/smoke-financeiro-isolamento.js --base-url=http://localhost:3001 --db=backend/academia.sqlite
// Variaveis: SEED_DEV_PASSWORD (dev12345), SMOKE_PLATFORM_LOGIN (admin),
//            SMOKE_PLATFORM_PASSWORD (BOOTSTRAP_ADMIN_PASSWORD ou admin123).

const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const BASE = (args['base-url'] || process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DB_PATH = path.resolve(args.db || 'backend/academia.sqlite');
const PW = process.env.SEED_DEV_PASSWORD || 'dev12345';
const PLATFORM_LOGIN = process.env.SMOKE_PLATFORM_LOGIN || 'admin';
const PLATFORM_PW = process.env.SMOKE_PLATFORM_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin123';
const RUN = Date.now().toString(36);

const sqlite3 = require(require.resolve('sqlite3', { paths: [process.cwd(), path.join(__dirname, '..', '..')] }));
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
const q1 = (sql, p = []) => new Promise((ok, ko) => db.get(sql, p, (e, row) => (e ? ko(e) : ok(row))));

const resultados = {};
let atual = 'setup';
function requisito(id) { atual = id; resultados[id] = resultados[id] || { ok: 0, falhas: 0 }; console.log(`\n== ${id}`); }
function check(label, cond, extra = '') {
  resultados[atual] = resultados[atual] || { ok: 0, falhas: 0 };
  if (cond) resultados[atual].ok += 1; else resultados[atual].falhas += 1;
  console.log(`${cond ? '[OK]     ' : '[FALHOU] '}${label}${extra !== '' ? ` - ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
}

async function req(method, p, { token, unit, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (unit) headers['X-Unit-Id'] = String(unit);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { json = null; }
  return { s: r.status, j: json, t: texto, code: json?.code || null };
}
async function login(l, senha = PW) {
  const r = await req('POST', '/auth/login', { body: { login: l, senha } });
  if (r.s !== 200) throw new Error(`login ${l}: ${r.s} ${r.code}`);
  return { token: r.j.data.token, user: r.j.data.usuario };
}
const dado = (r) => r.j?.data ?? r.j;
const hoje = new Date().toISOString().slice(0, 10);

// Rotas do modulo Financeiro (leitura), com aliases.
const ROTAS_FINANCEIRO = [
  '/dashboard/financeiro', '/dashboard/financeiro/kpis',
  '/contas-financeiras', '/contasFinanceiras',
  '/plano-contas', '/planoContas',
  '/financeiro/ativos', '/financeiro/orcamento',
];
const rotaAnalise = () => `/fechamento-mensal/${hoje.slice(0, 4)}/${Number(hoje.slice(5, 7))}/analisar`;

async function criarAcademia(platform, tag) {
  const owner = `fin.${tag.toLowerCase()}.${RUN}`;
  const r = await req('POST', '/onboarding/tenants', {
    token: platform.token,
    body: {
      tenant_nome: `Academia ${tag} ${RUN}`, tenant_documento: `smoke-fin-${tag.toLowerCase()}-${RUN}`, tenant_status: 'ativo',
      unit_nome: `Unidade ${tag}`, unit_codigo: 'unidade',
      admin_nome: `Owner ${tag}`, admin_login: owner, admin_senha: PW,
    },
  });
  if (r.s !== 201) throw new Error(`onboarding ${tag}: ${r.s} ${r.code} ${r.t.slice(0, 120)}`);
  const s = await login(owner);
  const unit = s.user.allowedUnits[0];
  const a = { tag, marca: `${tag.toUpperCase()}-${RUN}`, owner: s, unit: Number(unit.id), tenant: Number(unit.tenant_id) };
  for (const papel of ['recepcao', 'financeiro', 'gestor', 'operador_acesso']) {
    const loginPapel = `fin.${tag.toLowerCase()}.${papel}.${RUN}`;
    const u = await req('POST', '/usuarios-internos', {
      token: s.token, unit: a.unit,
      body: { nome: `${papel} ${tag}`, login: loginPapel, senha: PW, papel, unit_ids: [a.unit] },
    });
    if (u.s !== 201) throw new Error(`criar ${papel} ${tag}: ${u.s} ${u.code} ${u.t.slice(0, 120)}`);
    a[papel] = await login(loginPapel);
  }
  return a;
}

async function popular(a) {
  const t = a.owner.token; const unit = a.unit; const m = a.marca;
  let r = await req('POST', '/plano-contas', { token: t, unit, body: { nome: `Categoria ${m}`, tipo: 'despesa' } });
  a.categoria = r.j?.id;
  r = await req('POST', '/contas-financeiras', { token: t, unit, body: { descricao: `Conta ${m}`, tipo: 'despesa', valor: 70, data_lancamento: hoje, status: 'pendente', plano_contas_id: a.categoria } });
  a.conta = r.j?.id;
  r = await req('POST', '/financeiro/ativos', { token: t, unit, body: { nome: `Ativo ${m}`, tipo: 'equipamento', valor_aquisicao: 900, data_aquisicao: hoje, status: 'ativo' } });
  a.ativo = r.j?.id;
  r = await req('POST', '/financeiro/orcamento', { token: t, unit, body: { ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)), tipo: 'despesa', valor_previsto: 500, descricao: `Orcamento ${m}` } });
  a.orcamento = r.j?.id;
  const fd = new FormData(); fd.append('nome', `Produto ${m}`); fd.append('preco', '30'); fd.append('estoque', '10');
  r = await fetch(`${BASE}/produtos`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'X-Unit-Id': String(unit) }, body: fd });
  a.produto = (await r.json())?.id;
  r = await req('POST', '/planos', { token: t, unit, body: { nome: `Plano ${m}`, valor_base: 80 } });
  a.plano = dado(r)?.id;
  r = await req('POST', '/alunos', { token: t, unit, body: { nome: `Aluno ${m}`, data_nascimento: '1990-01-01', plano_id: a.plano, dia_vencimento: 10, status: 'ativo' } });
  a.aluno = dado(r)?.id;
  r = await req('POST', '/mensalidades', { token: t, unit, body: { aluno_id: a.aluno, plano_id: a.plano, vencimento: `${hoje.slice(0, 8)}10`, valor_cobrado: 80 } });
  a.mensalidade = dado(r)?.id;
  r = await req('POST', '/pagamentos', { token: t, unit, body: { mensalidade_id: a.mensalidade, valor_pago: 80, data_pagamento: hoje } });
  a.pagamento = r.j?.id;
  r = await req('POST', '/vendas-produtos', { token: t, unit, body: { produto_id: a.produto, quantidade: 2 } });
  a.venda = r.j?.id;
  const faltando = ['categoria', 'conta', 'ativo', 'orcamento', 'produto', 'plano', 'aluno', 'mensalidade', 'pagamento', 'venda'].filter((k) => !a[k]);
  check(`setup ${a.tag}: categoria, conta, ativo, orcamento, produto, plano, aluno, mensalidade, pagamento e venda`, faltando.length === 0, faltando.length ? `faltando: ${faltando.join(',')}` : '');
}

const fotoConta = (id) => q1('SELECT * FROM conta_financeira WHERE id = ?', [id]).then(JSON.stringify);

(async () => {
  requisito('setup');
  const platform = await login(PLATFORM_LOGIN, PLATFORM_PW);
  const alfa = await criarAcademia(platform, 'Alfa');
  const beta = await criarAcademia(platform, 'Beta');
  check('duas academias com uma unidade cada, Redes diferentes', alfa.tenant !== beta.tenant && alfa.owner.user.allowedUnits.length === 1 && beta.owner.user.allowedUnits.length === 1,
    { alfa: [alfa.tenant, alfa.unit], beta: [beta.tenant, beta.unit] });
  await popular(alfa);
  await popular(beta);

  // =====================================================================
  requisito('R1 isolamento');
  for (const [eu, outra] of [[alfa, beta], [beta, alfa]]) {
    const t = eu.owner.token;
    for (const rota of ['/contas-financeiras', '/plano-contas', '/financeiro/ativos', '/financeiro/orcamento', '/produtos', '/alunos', '/vendas-produtos', '/pagamentos']) {
      const r = await req('GET', rota, { token: t });
      check(`${eu.tag}: GET ${rota} mostra so dados proprios`, r.s === 200 && !r.t.includes(outra.marca) && (rota === '/pagamentos' || rota === '/vendas-produtos' || r.t.includes(eu.marca)),
        `${r.s} propria=${r.t.includes(eu.marca)} outra=${r.t.includes(outra.marca)}`);
    }
    for (const rota of ['/alunos', '/contas-financeiras', '/produtos']) {
      const r = await req('GET', rota, { token: t, unit: outra.unit });
      check(`${eu.tag}: X-Unit-Id da unidade de ${outra.tag} em GET ${rota} -> 403`, r.s === 403, `${r.s} ${r.code || ''}`);
    }
    const antesConta = await fotoConta(outra.conta);
    const tentativas = [
      ['PUT', `/contas-financeiras/${outra.conta}`, { descricao: 'invasao', tipo: 'despesa', valor: 1, data_lancamento: hoje, status: 'pago' }],
      ['PATCH', `/contas-financeiras/${outra.conta}/status`, { status: 'pago' }],
      ['DELETE', `/contas-financeiras/${outra.conta}`, {}],
      ['POST', `/contas-financeiras/${outra.conta}/reverter`, { motivo: 'invasao' }],
      ['POST', `/reversoes/contas-financeiras/${outra.conta}`, { motivo: 'invasao' }],
      ['PUT', `/plano-contas/${outra.categoria}`, { nome: 'invasao', tipo: 'despesa' }],
      ['PUT', `/financeiro/ativos/${outra.ativo}`, { nome: 'invasao', tipo: 'x', valor_aquisicao: 1, data_aquisicao: hoje, status: 'x' }],
      ['PUT', `/financeiro/orcamento/${outra.orcamento}`, { ano: 2000, mes: 1, tipo: 'x', valor_previsto: 1, descricao: 'invasao' }],
      ['GET', `/produtos/${outra.produto}`],
      ['GET', `/alunos/${outra.aluno}`],
      ['GET', `/vendas-produtos/${outra.venda}`],
      ['POST', `/vendas-produtos/${outra.venda}/reverter`, { motivo: 'invasao' }],
      ['POST', `/pagamentos/${outra.pagamento}/estornar`, { motivo: 'invasao' }],
      ['DELETE', `/financeiro/ativos/${outra.ativo}`],
      ['DELETE', `/financeiro/orcamento/${outra.orcamento}`],
      ['DELETE', `/plano-contas/${outra.categoria}`],
    ];
    for (const [metodo, rota, body] of tentativas) {
      const r = await req(metodo, rota, { token: t, body });
      check(`${eu.tag}: ${metodo} ${rota.replace(/\d+/, `<${outra.tag}>`)} -> 404`, r.s === 404, `${r.s} ${r.code || ''}`);
    }
    const [cat, at, orc, pag] = await Promise.all([
      q1('SELECT nome FROM plano_contas WHERE id = ?', [outra.categoria]),
      q1('SELECT nome FROM ativo WHERE id = ?', [outra.ativo]),
      q1('SELECT descricao FROM orcamento WHERE id = ?', [outra.orcamento]),
      q1('SELECT estornado_em FROM pagamento WHERE id = ?', [outra.pagamento]),
    ]);
    check(`${eu.tag}: registros de ${outra.tag} intactos (conta, categoria, ativo, orcamento, pagamento)`,
      antesConta === await fotoConta(outra.conta) && cat?.nome === `Categoria ${outra.marca}` && at?.nome === `Ativo ${outra.marca}`
        && orc?.descricao === `Orcamento ${outra.marca}` && !pag?.estornado_em,
      { categoria: cat?.nome, ativo: at?.nome, orcamento: orc?.descricao, estornado: pag?.estornado_em });
  }

  // =====================================================================
  requisito('R2 acesso ao Financeiro');
  for (const rota of [...ROTAS_FINANCEIRO, rotaAnalise()]) {
    const r = await req('GET', rota);
    check(`sem sessao: GET ${rota} -> 401`, r.s === 401, `${r.s} ${r.code || ''}`);
  }
  for (const papel of ['recepcao', 'gestor', 'operador_acesso']) {
    const s = alfa[papel];
    const negadas = [];
    for (const rota of [...ROTAS_FINANCEIRO, rotaAnalise()]) {
      const r = await req('GET', rota, { token: s.token });
      if (r.s !== 403) negadas.push(`${rota}=${r.s}`);
    }
    check(`${papel}: GET nas ${ROTAS_FINANCEIRO.length + 1} rotas do Financeiro -> 403`, negadas.length === 0, negadas.join(' '));
    const nContas = (await q1('SELECT COUNT(*) AS n FROM conta_financeira')).n;
    const antes = await fotoConta(alfa.conta);
    const escritas = [
      await req('POST', '/contas-financeiras', { token: s.token, body: { descricao: `invasao ${papel}`, tipo: 'despesa', valor: 9, data_lancamento: hoje, status: 'pago' } }),
      await req('PUT', `/contas-financeiras/${alfa.conta}`, { token: s.token, body: { descricao: 'invasao', tipo: 'despesa', valor: 9, data_lancamento: hoje, status: 'pago' } }),
      await req('PATCH', `/contas-financeiras/${alfa.conta}/status`, { token: s.token, body: { status: 'pago' } }),
      await req('POST', '/plano-contas', { token: s.token, body: { nome: 'invasao', tipo: 'receita' } }),
      await req('POST', '/financeiro/ativos', { token: s.token, body: { nome: 'invasao' } }),
      await req('POST', '/financeiro/orcamento', { token: s.token, body: { ano: 2026, mes: 1, tipo: 'x', valor_previsto: 1 } }),
    ];
    check(`${papel}: criar/alterar conta, plano de contas, ativo e orcamento -> 403 sem gravar`,
      escritas.every((r) => r.s === 403) && nContas === (await q1('SELECT COUNT(*) AS n FROM conta_financeira')).n && antes === await fotoConta(alfa.conta),
      escritas.map((r) => r.s).join(','));
  }
  for (const papel of ['financeiro', 'owner']) {
    const s = alfa[papel];
    const falhas = [];
    for (const rota of [...ROTAS_FINANCEIRO, rotaAnalise()]) {
      const r = await req('GET', rota, { token: s.token });
      if (r.s !== 200) falhas.push(`${rota}=${r.s}`);
    }
    check(`${papel}: GET nas rotas do Financeiro -> 200`, falhas.length === 0, falhas.join(' '));
  }
  let r = await req('GET', '/alunos', { token: alfa.recepcao.token });
  check('recepcao: consulta alunos da propria unidade -> 200', r.s === 200 && r.t.includes(alfa.marca), r.s);
  r = await req('POST', '/acessos', { token: alfa.recepcao.token, body: { aluno_id: alfa.aluno } });
  check('recepcao: registra entrada na propria unidade -> 2xx', r.s >= 200 && r.s < 300, `${r.s} ${r.j?.acesso?.resultado || r.code || ''}`);
  r = await req('POST', '/acessos', { token: alfa.recepcao.token, body: { aluno_id: beta.aluno } });
  check('recepcao: entrada de aluno da outra Rede -> 404', r.s === 404, `${r.s} ${r.code || ''}`);

  // =====================================================================
  requisito('R3 categoria');
  {
    const t = alfa.owner.token;
    const nContas = (await q1('SELECT COUNT(*) AS n FROM conta_financeira')).n;
    r = await req('POST', '/contas-financeiras', { token: t, body: { descricao: `Cruzada ${alfa.marca}`, tipo: 'despesa', valor: 10, data_lancamento: hoje, status: 'pendente', plano_contas_id: beta.categoria } });
    check('Alfa cria conta com categoria da Beta -> 422 PLANO_CONTAS_INVALIDO, sem gravar', r.s === 422 && r.code === 'PLANO_CONTAS_INVALIDO' && nContas === (await q1('SELECT COUNT(*) AS n FROM conta_financeira')).n,
      `${r.s} ${r.code || ''}`);
    const antes = await fotoConta(alfa.conta);
    r = await req('PUT', `/contas-financeiras/${alfa.conta}`, { token: t, body: { descricao: `Conta ${alfa.marca} editada`, tipo: 'despesa', valor: 71, data_lancamento: hoje, status: 'pendente', plano_contas_id: beta.categoria } });
    check('Alfa edita conta para categoria da Beta -> 422, conta intacta', r.s === 422 && antes === await fotoConta(alfa.conta), `${r.s} ${r.code || ''}`);
    r = await req('POST', '/contas-financeiras', { token: t, body: { descricao: `Propria ${alfa.marca}`, tipo: 'despesa', valor: 11, data_lancamento: hoje, status: 'pendente', plano_contas_id: alfa.categoria } });
    const propria = r.j?.id;
    check('Alfa cria conta com a propria categoria -> 201', r.s === 201 && (await q1('SELECT plano_contas_id FROM conta_financeira WHERE id = ?', [propria]))?.plano_contas_id === alfa.categoria, r.s);
    r = await req('PUT', `/contas-financeiras/${alfa.conta}`, { token: t, body: { descricao: `Conta ${alfa.marca}`, tipo: 'despesa', valor: 72, data_lancamento: hoje, status: 'pendente', plano_contas_id: alfa.categoria } });
    check('Alfa edita conta mantendo a propria categoria -> 200', r.s === 200, r.s);
    r = await req('GET', '/contas-financeiras', { token: t });
    const linhaPropria = (r.j?.data || []).find((c) => c.id === propria);
    check('listagem mostra o nome da categoria propria', linhaPropria?.plano_nome === `Categoria ${alfa.marca}`, linhaPropria?.plano_nome);
  }
  // Registro antigo: conta da Beta apontando para categoria da Alfa (gravado direto na base).
  const antigoId = await new Promise((ok, ko) => {
    const w = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);
    w.configure('busyTimeout', 5000);
    w.run(`INSERT INTO conta_financeira (descricao, tipo, valor, data_lancamento, status, plano_contas_id, origem, tenant_id, unit_id, created_at, updated_at)
           VALUES (?, 'despesa', 45, ?, 'pago', ?, 'conta_financeira', ?, ?, datetime('now'), datetime('now'))`,
    [`Antiga ${beta.marca}`, hoje, alfa.categoria, beta.tenant, beta.unit], function cb(e) { const id = this?.lastID; w.close(); return e ? ko(e) : ok(id); });
  });
  r = await req('GET', '/contas-financeiras', { token: beta.owner.token });
  const antiga = (r.j?.data || []).find((c) => c.id === antigoId);
  check('registro antigo da Beta com categoria da Alfa: aparece sem o nome da categoria', antiga && antiga.plano_nome == null && !r.t.includes(alfa.marca), antiga ? `plano_nome=${antiga.plano_nome}` : 'nao listado');
  // Lancamentos automaticos (venda e pagamento) sem categoria valida da Rede.
  for (const a of [alfa, beta]) {
    const lv = await q1("SELECT plano_contas_id, valor, origem, tenant_id FROM conta_financeira WHERE origem = 'venda_produto' AND origem_id = ?", [a.venda]);
    const lp = await q1("SELECT plano_contas_id, valor, origem, tenant_id FROM conta_financeira WHERE origem = 'pagamento_mensalidade' AND origem_id = ?", [a.pagamento]);
    const catOk = async (l) => l && (l.plano_contas_id == null || (await q1('SELECT 1 AS ok FROM plano_contas WHERE id = ? AND tenant_id = ?', [l.plano_contas_id, l.tenant_id])));
    check(`${a.tag}: lancamento da venda sem categoria de outra Rede, valor 60 e origem preservados`, (await catOk(lv)) && lv.valor === 60 && lv.origem === 'venda_produto', lv);
    check(`${a.tag}: lancamento do pagamento sem categoria de outra Rede, valor 80 e origem preservados`, (await catOk(lp)) && lp.valor === 80 && lp.origem === 'pagamento_mensalidade', lp);
  }
  const fotoContrapartidas = () => q1("SELECT COUNT(*) AS n FROM conta_financeira WHERE origem = 'reversao_controlada'");
  const antesContrapartidas = await fotoContrapartidas();
  r = await req('POST', `/contas-financeiras/${antigoId}/reverter`, { token: beta.owner.token, body: { motivo: 'S1 fin: contrapartida' } });
  check('conta antiga nao gera contrapartida sem aprovacao',
    r.s === 409 && r.code === 'REVERSAO_APROVACAO_NECESSARIA', `${r.s} ${r.code}`);
  r = await req('POST', `/vendas-produtos/${beta.venda}/reverter`, { token: beta.owner.token, body: { motivo: 'S1 fin: venda' } });
  check('venda nao gera contrapartida sem aprovacao',
    r.s === 409 && r.code === 'REVERSAO_APROVACAO_NECESSARIA' && (await fotoContrapartidas()).n === antesContrapartidas.n,
    `${r.s} ${r.code}`);

  // =====================================================================
  requisito('R4 estorno e fechamento');
  {
    const fotoPag = async () => JSON.stringify(await q1('SELECT p.estornado_em, p.reversao_controlada_id, m.status FROM pagamento p JOIN mensalidade m ON m.id = p.mensalidade_id WHERE p.id = ?', [alfa.pagamento]));
    let antes = await fotoPag();
    r = await req('POST', `/pagamentos/${alfa.pagamento}/estornar`, { token: alfa.recepcao.token, body: { motivo: 'recepcao' } });
    check('recepcao estorna pagamento -> 403, pagamento preservado', r.s === 403 && antes === await fotoPag(), `${r.s} ${r.code || ''}`);
    r = await req('POST', `/contas-financeiras/${alfa.conta}/reverter`, { token: alfa.recepcao.token, body: { motivo: 'recepcao' } });
    check('recepcao estorna conta financeira -> 403', r.s === 403, `${r.s} ${r.code || ''}`);
    r = await req('POST', `/pagamentos/${beta.pagamento}/estornar`, { token: alfa.financeiro.token, body: { motivo: 'outra rede' } });
    check('financeiro da Alfa estorna pagamento da Beta -> 404', r.s === 404, `${r.s} ${r.code || ''}`);
    r = await req('POST', `/pagamentos/${alfa.pagamento}/estornar`, { token: alfa.financeiro.token, body: { motivo: 'S1 fin: estorno autorizado' } });
    check('financeiro aguarda aprovacao, pagamento preservado', r.s === 409 && r.code === 'REVERSAO_APROVACAO_NECESSARIA' && antes === await fotoPag(), `${r.s} ${r.code || r.j?.status_mensalidade}`);

    const [ano, mes] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))];
    const fotoFech = async () => JSON.stringify(await q1('SELECT status, reaberto_em FROM fechamento_mensal WHERE ano = ? AND mes = ? AND unit_id = ?', [ano, mes, alfa.unit]));
    r = await req('POST', `/fechamento-mensal/${ano}/${mes}/fechar`, { token: alfa.financeiro.token });
    check('financeiro tenta fechar o periodo -> 403 (fechamento:fechar)', r.s === 403, `${r.s} ${r.code || ''}`);
    r = await req('POST', `/fechamento-mensal/${ano}/${mes}/fechar`, { token: alfa.owner.token });
    check('owner fecha o periodo da propria unidade -> 200', r.s === 200 && String(r.j?.fechamento?.status).startsWith('fechado'), `${r.s} ${r.j?.fechamento?.status}`);
    antes = await fotoFech();
    r = await req('POST', `/fechamento-mensal/${ano}/${mes}/reabrir`, { token: alfa.financeiro.token, body: { motivo: 'Conferencia no smoke L02' } });
    check('financeiro tenta reabrir -> 403, fechamento preservado', r.s === 403 && antes === await fotoFech(), `${r.s} ${r.code || ''}`);
    r = await req('POST', `/fechamento-mensal/${ano}/${mes}/reabrir`, { token: alfa.recepcao.token, body: { motivo: 'Conferencia no smoke L02' } });
    check('recepcao tenta reabrir -> 403, fechamento preservado', r.s === 403 && antes === await fotoFech(), `${r.s} ${r.code || ''}`);
    r = await req('POST', `/fechamento-mensal/${ano}/${mes}/fechar`, { token: beta.owner.token, unit: beta.unit });
    check('owner da Beta fecha o mes na propria unidade', r.s === 200 && String(r.j?.fechamento?.status).startsWith('fechado'), `${r.s} ${r.code || ''}`);
    r = await req('POST', `/fechamento-mensal/${ano}/${mes}/reabrir`, { token: beta.owner.token, unit: beta.unit, body: { motivo: 'Conferencia no smoke L02' } });
    check('owner da Beta reabre o mes na propria unidade sem afetar a Alfa',
      r.s === 200 && r.j?.status === 'reaberto' && Number(r.j?.unit_id) === beta.unit && antes === await fotoFech(),
      `${r.s} ${r.code || ''}`);
    r = await req('POST', `/fechamento-mensal/${ano}/${mes}/reabrir`, { token: alfa.owner.token, body: { motivo: 'Conferencia no smoke L02' } });
    check('owner reabre o periodo da propria unidade -> 200', r.s === 200 && r.j?.status === 'reaberto', `${r.s} ${r.j?.status || r.code}`);
  }

  console.log('\nResumo por requisito:');
  let falhas = 0;
  for (const [id, x] of Object.entries(resultados)) {
    falhas += x.falhas;
    console.log(`  ${id}: ${x.ok}/${x.ok + x.falhas} OK`);
  }
  db.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('[ERRO]', e);
  db.close();
  process.exit(1);
});
