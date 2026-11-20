// Smoke L04 · Venda com pagamento dividido e devolucao por meio (16/11/2026).
//
// Base DESCARTAVEL criada com `npm run db:seed:dev` e a API rodando sobre ela.
// O smoke cria produtos "L04P ..." na Matriz, registra vendas pagas em mais de
// um meio, solicita, aprova e executa estornos e le o SQLite somente para
// conferir estoque, vendas, lancamentos, valores por meio e auditoria.
//
// Uso:
//   node tests/scripts/smoke-l04-venda-pagamento.js --base-url=http://localhost:3001 --db=backend/academia.sqlite
// Variaveis: SEED_DEV_PASSWORD (dev12345), SMOKE_PLATFORM_LOGIN (admin),
//            SMOKE_PLATFORM_PASSWORD (BOOTSTRAP_ADMIN_PASSWORD ou admin123).

const path = require('path');
const { randomUUID } = require('crypto');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const BASE = (args['base-url'] || process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DB_PATH = path.resolve(args.db || 'backend/academia.sqlite');
const PW = process.env.SEED_DEV_PASSWORD || 'dev12345';
const RUN = Date.now().toString(36);

const sqlite3 = require(require.resolve('sqlite3', { paths: [process.cwd(), path.join(__dirname, '..', '..')] }));
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
const q1 = (sql, p = []) => new Promise((ok, ko) => db.get(sql, p, (e, r) => (e ? ko(e) : ok(r))));
const qa = (sql, p = []) => new Promise((ok, ko) => db.all(sql, p, (e, r) => (e ? ko(e) : ok(r))));

const resultados = {};
let atual = 'setup';
function grupo(nome) { atual = nome; resultados[nome] = resultados[nome] || { ok: 0, falhas: 0 }; console.log(`\n== ${nome}`); }
function check(label, cond, extra = '') {
  resultados[atual] = resultados[atual] || { ok: 0, falhas: 0 };
  if (cond) resultados[atual].ok += 1; else resultados[atual].falhas += 1;
  console.log(`${cond ? '[OK]     ' : '[FALHOU] '}${label}${extra !== '' ? ` - ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
}

async function req(method, p, { s, unit, body, key } = {}) {
  const headers = {};
  if (s) headers.Authorization = `Bearer ${s.token}`;
  if (unit) headers['X-Unit-Id'] = String(unit);
  if (key) headers['Idempotency-Key'] = key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { j = null; }
  return { s: r.status, j, code: j?.code || null, t, replay: r.headers.get('idempotent-replayed') };
}
async function login(l, senha = PW) {
  const r = await req('POST', '/auth/login', { body: { login: l, senha } });
  if (r.s !== 200) throw new Error(`login ${l}: ${r.s} ${r.code}`);
  return { token: r.j.data.token, user: r.j.data.usuario, login: l };
}

// Estado que uma venda ou um estorno altera, por produto.
async function foto(produtoId) {
  const [prod, vendas, receitas, pagamentos, estornos, auditoria] = await Promise.all([
    q1('SELECT estoque FROM produto WHERE id = ?', [produtoId]),
    qa('SELECT id, reversao_controlada_id FROM venda_produto WHERE produto_id = ? ORDER BY id', [produtoId]),
    qa(`SELECT cf.id, cf.tipo, cf.valor, cf.origem FROM conta_financeira cf
        WHERE cf.deleted_at IS NULL AND ((cf.origem = 'venda_produto' AND cf.origem_id IN (SELECT id FROM venda_produto WHERE produto_id = ?))
          OR (cf.origem = 'reversao_controlada' AND cf.descricao LIKE 'Estorno da venda %'))
        ORDER BY cf.id`, [produtoId]),
    qa(`SELECT p.venda_id, p.tipo, p.meio, p.valor_centavos FROM venda_pagamento p
        JOIN venda_produto v ON v.id = p.venda_id WHERE v.produto_id = ? ORDER BY p.id`, [produtoId]),
    qa(`SELECT e.id, e.status FROM venda_estorno e JOIN venda_produto v ON v.id = e.venda_id WHERE v.produto_id = ? ORDER BY e.id`, [produtoId]),
    q1("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('registrar_venda_produto', 'executar_estorno_venda')"),
  ]);
  return JSON.stringify({ estoque: prod?.estoque, vendas, receitas, pagamentos, estornos, auditoria: auditoria.n });
}

async function semEfeito(label, produtoId, chamada, status, codigo, conferir) {
  const antes = await foto(produtoId);
  const r = await chamada();
  const depois = await foto(produtoId);
  check(`${label} -> ${status}${codigo ? ` ${codigo}` : ''}`, r.s === status && (!codigo || r.code === codigo) && (!conferir || conferir(r)),
    `${r.s} ${r.code || ''} ${r.j?.error || ''} ${r.j?.details ? JSON.stringify(r.j.details) : ''}`.trim());
  check(`${label}: estoque, vendas, lancamentos, meios, estornos e auditoria intactos`, antes === depois, antes === depois ? '' : `antes=${antes} depois=${depois}`);
  return r;
}

const pag = (...itens) => itens.map(([meio, valor]) => ({ meio, valor }));

(async () => {
  grupo('setup');
  const owner = await login('owner');
  const gestor = await login('gestor');
  const recepcao = await login('recepcao');
  const operador = await login('operador');
  const matriz = Number(owner.user.allowedUnits.find((u) => u.codigo === 'matriz').id);
  const filial = Number(owner.user.allowedUnits.find((u) => u.codigo === 'filial').id);

  async function produto(nome, preco, estoque) {
    const fd = new FormData(); fd.append('nome', `L04P ${nome} ${RUN}`); fd.append('preco', String(preco)); fd.append('estoque', String(estoque));
    const r = await fetch(`${BASE}/produtos`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'X-Unit-Id': String(matriz) }, body: fd });
    const j = await r.json();
    if (r.status !== 201) throw new Error(`produto ${nome}: ${r.status}`);
    return j;
  }
  const preTreino = await produto('Pre-treino dose', 5, 30);
  const bala = await produto('Bala', 0.1, 30);
  check('setup: pre-treino R$ 5 e bala R$ 0,10 na Matriz', Number(preTreino.preco) === 5 && Number(bala.preco) === 0.1);
  const vender = (s, body, opcoes = {}) => req('POST', '/vendas-produtos', { s, unit: opcoes.unit, body, key: opcoes.key });
  const venda = (pagamentos, extra = {}) => ({ produto_id: preTreino.id, quantidade: 1, pagamentos, ...extra });

  // ===================================================================
  grupo('Preco de catalogo');
  for (const [label, extra] of [
    ['preco_unitario menor que o catalogo', { preco_unitario: 1 }],
    ['preco_unitario igual ao catalogo', { preco_unitario: 5 }],
    ['valor_total informado', { valor_total: 1 }],
  ]) {
    await semEfeito(`API com ${label}`, preTreino.id, () => vender(recepcao, venda(pag(['dinheiro', 1]), extra)), 422, 'PRECO_MANUAL_NAO_PERMITIDO');
  }

  // ===================================================================
  grupo('Quitacao e validacao em centavos');
  await semEfeito('sem pagamentos', preTreino.id, () => vender(recepcao, { produto_id: preTreino.id, quantidade: 1 }), 400, 'PAGAMENTOS_OBRIGATORIOS');
  await semEfeito('lista vazia de pagamentos', preTreino.id, () => vender(recepcao, venda([])), 400, 'PAGAMENTOS_OBRIGATORIOS');
  await semEfeito('R$ 2 em dinheiro para venda de R$ 5', preTreino.id, () => vender(recepcao, venda(pag(['dinheiro', 2]))), 422, 'PAGAMENTO_INCOMPLETO',
    (r) => r.j?.details?.restante === 3 && r.j?.details?.informado === 2 && r.j?.details?.total === 5);
  await semEfeito('R$ 2 + R$ 4 (passa do total)', preTreino.id, () => vender(recepcao, venda(pag(['dinheiro', 2], ['pix', 4]))), 422, 'PAGAMENTO_ACIMA_DO_TOTAL',
    (r) => r.j?.details?.excedente === 1);
  await semEfeito('meio cheque', preTreino.id, () => vender(recepcao, venda(pag(['cheque', 5]))), 400, 'PAGAMENTO_MEIO_INVALIDO');
  for (const valor of [0, -1, 2.555, '2,555', 'abc', null]) {
    await semEfeito(`valor ${JSON.stringify(valor)}`, preTreino.id, () => vender(recepcao, venda(pag(['dinheiro', valor], ['pix', 3]))), 400, 'PAGAMENTO_VALOR_INVALIDO');
  }
  let r = await vender(recepcao, { produto_id: bala.id, quantidade: 3, pagamentos: pag(['dinheiro', 0.1], ['pix', 0.2]) });
  check('R$ 0,10 + R$ 0,20 quita 3 balas de R$ 0,10 (comparacao em centavos) -> 201', r.s === 201 && r.j?.valor_total === 0.3, `${r.s} ${r.code || ''} ${r.j?.valor_total}`);
  r = await vender(recepcao, { produto_id: bala.id, quantidade: 3, pagamentos: pag(['dinheiro', '0,30']) });
  check('valor em texto com virgula ("0,30") -> 201', r.s === 201, `${r.s} ${r.code || ''}`);

  // ===================================================================
  grupo('Venda de R$ 5 com R$ 2 em dinheiro e R$ 3 no Pix');
  const estoqueAntes = (await q1('SELECT estoque FROM produto WHERE id = ?', [preTreino.id])).estoque;
  r = await vender(recepcao, venda(pag(['dinheiro', 2], ['pix', '3'])));
  const v1 = r.j;
  check('recepcao registra a venda -> 201 com preco de catalogo', r.s === 201 && v1.preco_unitario === 5 && v1.valor_total === 5 && v1.quantidade === 1, `${r.s} ${r.code || ''}`);
  check('resposta traz recebimentos e conferencia por meio', v1?.pagamento_registrado === true && v1.total_recebido === 5
    && JSON.stringify(v1.meios.map((m) => [m.meio, m.recebido, m.liquido])) === JSON.stringify([['dinheiro', 2, 2], ['pix', 3, 3]]), v1?.meios);
  check('uma unica baixa de estoque', (await q1('SELECT estoque FROM produto WHERE id = ?', [preTreino.id])).estoque === estoqueAntes - 1);
  const receitasV1 = await qa("SELECT valor, tipo FROM conta_financeira WHERE origem = 'venda_produto' AND origem_id = ? AND deleted_at IS NULL", [v1.id]);
  check('uma unica receita de R$ 5 (os meios nao duplicam a receita)', JSON.stringify(receitasV1) === JSON.stringify([{ valor: 5, tipo: 'receita' }]), receitasV1);
  const linhasV1 = await qa('SELECT tipo, meio, valor_centavos, tenant_id, unit_id, registrado_por FROM venda_pagamento WHERE venda_id = ? ORDER BY id', [v1.id]);
  check('dois recebimentos vinculados a venda, na Rede e Unidade, em centavos', linhasV1.length === 2
    && linhasV1.every((l) => l.tipo === 'recebimento' && l.unit_id === matriz && l.registrado_por === String(recepcao.user.id))
    && linhasV1.map((l) => `${l.meio}:${l.valor_centavos}`).join(',') === 'dinheiro:200,pix:300', linhasV1);
  const audV1 = await q1("SELECT metadata_json FROM audit_log WHERE action = 'registrar_venda_produto' AND record_id = ?", [String(v1.id)]);
  const metaV1 = JSON.parse(audV1?.metadata_json || '{}');
  check('auditoria da venda registra preco de catalogo e pagamentos', metaV1.preco === 'catalogo'
    && JSON.stringify(metaV1.pagamentos) === JSON.stringify([{ meio: 'dinheiro', valor: 2 }, { meio: 'pix', valor: 3 }]), metaV1);
  r = await req('GET', `/vendas-produtos/${v1.id}`, { s: recepcao });
  check('detalhe da venda mostra os meios', r.s === 200 && r.j?.meios?.length === 2 && r.j.total_liquido === 5, `${r.s}`);

  // ===================================================================
  grupo('Reenvio com Idempotency-Key');
  const chave = `l04p-${RUN}`;
  const corpo = venda(pag(['cartao_debito', 5]));
  const antesReenvio = (await q1('SELECT estoque FROM produto WHERE id = ?', [preTreino.id])).estoque;
  const primeira = await vender(recepcao, corpo, { key: chave });
  const reenvio = await vender(recepcao, corpo, { key: chave });
  check('primeiro envio 201 e reenvio 200 com a mesma venda e Idempotent-Replayed', primeira.s === 201 && reenvio.s === 200
    && reenvio.replay === 'true' && reenvio.j?.id === primeira.j?.id && reenvio.j?.meios?.[0]?.meio === 'cartao_debito', [primeira.s, reenvio.s, reenvio.replay]);
  const efeitosChave = async (vendaId) => ({
    estoque: (await q1('SELECT estoque FROM produto WHERE id = ?', [preTreino.id])).estoque,
    receitas: (await q1("SELECT COUNT(*) AS n FROM conta_financeira WHERE origem = 'venda_produto' AND origem_id = ? AND deleted_at IS NULL", [vendaId])).n,
    pagamentos: (await q1('SELECT COUNT(*) AS n FROM venda_pagamento WHERE venda_id = ?', [vendaId])).n,
    vendas: (await q1('SELECT COUNT(*) AS n FROM venda_produto WHERE chave_idempotencia = ?', [chave])).n,
  });
  let efeitos = await efeitosChave(primeira.j.id);
  check('reenvio nao repete estoque, receita nem pagamentos', JSON.stringify(efeitos) === JSON.stringify({ estoque: antesReenvio - 1, receitas: 1, pagamentos: 1, vendas: 1 }), efeitos);
  await semEfeito('mesma chave com outros pagamentos', preTreino.id, () => vender(recepcao, venda(pag(['dinheiro', 5])), { key: chave }), 409, 'IDEMPOTENCIA_CONFLITO');
  const chave2 = `l04p-par-${RUN}`;
  const par = await Promise.all([vender(recepcao, venda(pag(['pix', 5])), { key: chave2 }), vender(recepcao, venda(pag(['pix', 5])), { key: chave2 })]);
  check('dois envios simultaneos com a mesma chave -> 201 e 200 com a mesma venda', par.map((x) => x.s).sort().join(',') === '200,201' && par[0].j?.id === par[1].j?.id,
    par.map((x) => x.s));
  efeitos = { pagamentos: (await q1('SELECT COUNT(*) AS n FROM venda_pagamento WHERE venda_id = ?', [par[0].j.id])).n };
  check('envio simultaneo grava um pagamento', efeitos.pagamentos === 1, efeitos);

  // ===================================================================
  grupo('Perfil e unidade');
  await semEfeito('operador de acesso vende', preTreino.id, () => vender(operador, venda(pag(['dinheiro', 5]))), 403, 'PERMISSAO_NEGADA');
  await semEfeito('recepcao seleciona a Filial', preTreino.id, () => vender(recepcao, venda(pag(['dinheiro', 5])), { unit: filial }), 403, 'UNIT_FORBIDDEN');
  await semEfeito('owner vende produto da Matriz com a Filial selecionada', preTreino.id, () => vender(owner, venda(pag(['dinheiro', 5])), { unit: filial }), 404, 'PRODUTO_NAO_ENCONTRADO');

  // ===================================================================
  grupo('Vendas anteriores ao pagamento por meio');
  r = await req('GET', '/vendas-produtos?limite=200', { s: recepcao });
  // Vendas do seed foram gravadas antes do pagamento por meio (sem recebimentos).
  const semMeio = (r.j?.vendas || []).filter((x) => !x.pagamento_registrado);
  const legada = semMeio.find((x) => !x.estorno_status && !x.reversao_controlada_id);
  const seedIds = (await qa("SELECT v.id FROM venda_produto v WHERE NOT EXISTS (SELECT 1 FROM venda_pagamento p WHERE p.venda_id = v.id) AND v.unit_id = ?", [matriz])).map((x) => x.id);
  check('somente vendas sem recebimento registrado aparecem sem meio', semMeio.every((x) => seedIds.includes(x.id)), semMeio.map((x) => x.id));
  const nova = (r.j?.vendas || []).find((x) => x.id === v1.id);
  check('venda do seed aparece sem meio atribuido', Boolean(legada) && legada.pagamento_registrado === false && legada.meios.length === 0
    && legada.recebimentos.length === 0, legada && { id: legada.id, reg: legada.pagamento_registrado });
  check('venda nova aparece com meios na lista', nova?.pagamento_registrado === true && nova.meios.length === 2);

  // ===================================================================
  const solicitarEAprovar = async (vendaId) => {
    const sol = await req('POST', `/vendas-produtos/${vendaId}/estornos`, { s: recepcao, body: { motivo: 'Cliente devolveu lacrado' } });
    const apr = await req('POST', `/vendas-produtos/estornos/${sol.j.id}/aprovar`, { s: gestor });
    if (sol.s !== 201 || apr.s !== 200) throw new Error(`estorno ${vendaId}: ${sol.s} ${apr.s} ${apr.code}`);
    return sol.j;
  };
  const executar = (eid, body, s = recepcao, unit) => req('POST', `/vendas-produtos/estornos/${eid}/executar`, { s, unit, body });
  const itens = (produtoId, q) => [{ produto_id: produtoId, quantidade_reposta: q }];

  grupo('Devolucao pelos meios originais');
  const e1 = await solicitarEAprovar(v1.id);
  r = await req('GET', `/vendas-produtos/estornos?venda_id=${v1.id}`, { s: recepcao });
  check('detalhe do estorno mostra os meios e valores originais', r.s === 200
    && JSON.stringify(r.j?.[0]?.conferencia?.recebimentos?.map((x) => [x.meio, x.valor])) === JSON.stringify([['dinheiro', 2], ['pix', 3]]), r.j?.[0]?.conferencia);
  await semEfeito('executar sem informar a devolucao', preTreino.id, () => executar(e1.id, { itens: itens(preTreino.id, 1) }), 422, 'DEVOLUCAO_OBRIGATORIA',
    (x) => JSON.stringify(x.j?.details?.sugestao) === JSON.stringify([{ meio: 'dinheiro', valor: 2 }, { meio: 'pix', valor: 3 }]));
  await semEfeito('executar sem confirmar a devolucao', preTreino.id,
    () => executar(e1.id, { itens: itens(preTreino.id, 1), devolucoes: pag(['dinheiro', 2], ['pix', 3]) }), 422, 'DEVOLUCAO_NAO_CONFIRMADA');
  await semEfeito('devolucao parcial (R$ 4)', preTreino.id,
    () => executar(e1.id, { itens: itens(preTreino.id, 1), devolucoes: pag(['dinheiro', 2], ['pix', 2]), devolucao_confirmada: true }), 422, 'DEVOLUCAO_DIFERENTE_DO_TOTAL');
  await semEfeito('owner com a Filial selecionada executa o estorno da Matriz', preTreino.id,
    () => executar(e1.id, { itens: itens(preTreino.id, 1), devolucoes: pag(['dinheiro', 2], ['pix', 3]), devolucao_confirmada: true }, owner, filial), 404, 'ESTORNO_NAO_ENCONTRADO');
  const estAntesE1 = (await q1('SELECT estoque FROM produto WHERE id = ?', [preTreino.id])).estoque;
  r = await executar(e1.id, { itens: itens(preTreino.id, 1), devolucoes: pag(['dinheiro', 2], ['pix', 3]), devolucao_confirmada: true, comprovante_referencia: 'Pix devolvido 10:15' });
  check('devolve R$ 2 em dinheiro e R$ 3 no Pix -> 200', r.s === 200 && r.j?.estorno?.status === 'executada' && r.j.estorno.devolucao_meio_alternativo === 0, `${r.s} ${r.code || ''} ${r.j?.error || ''}`);
  check('conferencia da venda: liquido R$ 0 em dinheiro, Pix e total', JSON.stringify(r.j?.conferencia?.meios?.map((m) => [m.meio, m.liquido])) === JSON.stringify([['dinheiro', 0], ['pix', 0]])
    && r.j?.conferencia?.total_liquido === 0, r.j?.conferencia?.meios);
  check('estoque reposto em 1 e contrapartida integral de R$ 5', (await q1('SELECT estoque FROM produto WHERE id = ?', [preTreino.id])).estoque === estAntesE1 + 1
    && Number(r.j?.lancamento_inverso?.valor) === 5);
  await semEfeito('executar de novo a mesma aprovacao', preTreino.id,
    () => executar(e1.id, { itens: itens(preTreino.id, 1), devolucoes: pag(['dinheiro', 2], ['pix', 3]), devolucao_confirmada: true }), 409, 'ESTORNO_JA_EXECUTADO');

  // ===================================================================
  grupo('Devolucao em outro meio, combinada com o cliente');
  const v2 = (await vender(recepcao, venda(pag(['dinheiro', 2], ['pix', 3])))).j;
  const e2 = await solicitarEAprovar(v2.id);
  const pix5 = pag(['pix', 5]);
  await semEfeito('R$ 5 no Pix sem motivo da troca', preTreino.id,
    () => executar(e2.id, { itens: itens(preTreino.id, 0), devolucoes: pix5, devolucao_confirmada: true, comprovante_referencia: 'E2E-123' }), 422, 'MOTIVO_TROCA_MEIO_OBRIGATORIO');
  await semEfeito('R$ 5 no Pix sem referencia do comprovante', preTreino.id,
    () => executar(e2.id, { itens: itens(preTreino.id, 0), devolucoes: pix5, devolucao_confirmada: true, motivo_troca_meio: 'Faltou dinheiro no caixa' }), 422, 'COMPROVANTE_OBRIGATORIO');
  r = await executar(e2.id, {
    itens: itens(preTreino.id, 0), devolucoes: pix5, devolucao_confirmada: true,
    motivo_troca_meio: 'Faltou dinheiro no caixa', comprovante_referencia: 'Pix E2E-123 10:20',
  });
  check('devolve R$ 5 no Pix com motivo e comprovante -> 200', r.s === 200 && r.j?.estorno?.devolucao_meio_alternativo === 1, `${r.s} ${r.code || ''} ${r.j?.error || ''}`);
  const meiosV2 = r.j?.conferencia?.meios?.map((m) => [m.meio, m.recebido, m.devolvido, m.liquido]);
  check('conferencia: R$ 2 liquidos em dinheiro, -R$ 2 no Pix e R$ 0 no total', JSON.stringify(meiosV2) === JSON.stringify([['dinheiro', 2, 0, 2], ['pix', 3, 5, -2]])
    && r.j?.conferencia?.total_liquido === 0, meiosV2);
  r = await req('GET', `/vendas-produtos/${v2.id}`, { s: recepcao });
  check('GET da venda repete a conferencia', JSON.stringify(r.j?.meios?.map((m) => m.liquido)) === JSON.stringify([2, -2]) && r.j?.total_liquido === 0, r.j?.meios);
  const ev2 = await q1('SELECT devolucao_meio_alternativo, devolucao_motivo, devolucao_comprovante, devolucao_confirmada_em, executado_por, aprovado_por FROM venda_estorno WHERE id = ?', [e2.id]);
  check('estorno guarda motivo, comprovante, confirmacao, autorizador e executor', ev2.devolucao_meio_alternativo === 1 && ev2.devolucao_motivo === 'Faltou dinheiro no caixa'
    && ev2.devolucao_comprovante === 'Pix E2E-123 10:20' && Boolean(ev2.devolucao_confirmada_em)
    && ev2.executado_por === String(recepcao.user.id) && ev2.aprovado_por === String(gestor.user.id), ev2);
  const devV2 = await qa("SELECT meio, valor_centavos, venda_estorno_id, comprovante_referencia FROM venda_pagamento WHERE venda_id = ? AND tipo = 'devolucao'", [v2.id]);
  check('devolucao vinculada a venda e ao estorno', devV2.length === 1 && devV2[0].meio === 'pix' && devV2[0].valor_centavos === 500
    && devV2[0].venda_estorno_id === e2.id && devV2[0].comprovante_referencia === 'Pix E2E-123 10:20', devV2);
  const audV2 = JSON.parse((await q1("SELECT metadata_json FROM audit_log WHERE action = 'executar_estorno_venda' AND record_id = ?", [String(e2.id)]))?.metadata_json || '{}');
  check('auditoria: meios originais, devolvidos, motivo, comprovante, autorizador e executor', audV2.devolucao?.meio_alternativo === true
    && audV2.devolucao?.motivo_troca_meio === 'Faltou dinheiro no caixa' && audV2.devolucao?.comprovante_referencia === 'Pix E2E-123 10:20'
    && JSON.stringify(audV2.devolucao?.meios_originais) === JSON.stringify([{ meio: 'dinheiro', valor: 2 }, { meio: 'pix', valor: 3 }])
    && JSON.stringify(audV2.devolucao?.itens) === JSON.stringify([{ meio: 'pix', valor: 5 }])
    && audV2.autorizador?.id === String(gestor.user.id) && audV2.executor?.id === String(recepcao.user.id) && audV2.quantidade_reposta === 0, audV2.devolucao);

  // ===================================================================
  grupo('Estorno de venda anterior ao pagamento por meio');
  const e3 = await solicitarEAprovar(legada.id);
  r = await executar(e3.id, { itens: [{ produto_id: legada.produto_id, quantidade_reposta: 0 }] });
  check('executa sem devolucao por meio (meio original desconhecido) -> 200', r.s === 200 && r.j?.conferencia?.pagamento_registrado === false
    && r.j.conferencia.devolucoes.length === 0, `${r.s} ${r.code || ''} ${r.j?.error || ''}`);
  check('nenhum meio atribuido a venda legada', (await q1('SELECT COUNT(*) AS n FROM venda_pagamento WHERE venda_id = ?', [legada.id])).n === 0);

  // ===================================================================
  grupo('Conferencia por meio da unidade');
  r = await req('GET', '/vendas-produtos/conferencia-meios', { s: recepcao });
  const somaBanco = await qa(`SELECT meio, SUM(CASE WHEN tipo = 'recebimento' THEN valor_centavos ELSE -valor_centavos END) AS liquido
                             FROM venda_pagamento WHERE unit_id = ? GROUP BY meio`, [matriz]);
  const esperado = Object.fromEntries(somaBanco.map((x) => [x.meio, x.liquido / 100]));
  check('totais por meio da API batem com o banco', r.s === 200 && r.j.meios.every((m) => m.liquido === (esperado[m.meio] || 0)), { api: r.j?.meios, esperado });
  check('total liquido = soma dos meios e vendas sem meio contadas a parte', Math.round(r.j.total.liquido * 100) === Math.round(r.j.meios.reduce((s, m) => s + m.liquido, 0) * 100)
    && r.j.sem_meio_registrado.vendas > 0, r.j?.total);
  r = await req('GET', '/vendas-produtos/conferencia-meios', { s: owner, unit: filial });
  const filialBanco = await q1(`SELECT COALESCE(SUM(CASE WHEN tipo = 'recebimento' THEN valor_centavos ELSE -valor_centavos END), 0) AS liquido
                                FROM venda_pagamento WHERE unit_id = ?`, [filial]);
  check('a Filial ve so os proprios meios (total igual ao banco da Filial)', r.s === 200
    && Math.round(r.j.total.liquido * 100) === filialBanco.liquido, { api: r.j?.total, banco: filialBanco.liquido });

  console.log('\nResumo por grupo:');
  let falhas = 0;
  for (const [nome, x] of Object.entries(resultados)) {
    falhas += x.falhas;
    console.log(`  ${nome}: ${x.ok}/${x.ok + x.falhas} OK`);
  }
  const total = Object.values(resultados).reduce((a, x) => a + x.ok + x.falhas, 0);
  console.log(`\n[smoke-l04-venda-pagamento] ${total - falhas}/${total} verificacoes OK`);
  db.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('[ERRO]', e);
  db.close();
  process.exit(1);
});
