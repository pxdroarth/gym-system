// Smoke L04 · Estorno de venda pela API (DN-3 ajustada).
//
// Fluxo padrao: atendente (recepcao), gestor, financeiro, admin ou dono
// solicitam com motivo; o gestor (ou dono/admin) aprova no sistema, ou um
// operador registra a autorizacao que o gestor deu por WhatsApp ou e-mail;
// atendente, financeiro, admin ou dono executam com aprovacao valida.
// Opcao da unidade: tres contas distintas entre solicitante, autorizador e
// executor.
//
// Base DESCARTAVEL criada com `npm run db:seed:dev` e a API rodando sobre ela.
// O smoke cria produtos e vendas "L04E ...", usuarios de teste, uma Rede B
// pelo onboarding, fecha e reabre o mes corrente na Matriz, liga e desliga a
// opcao de tres contas e le a base em modo somente leitura para conferir
// estoque, lancamentos, estados e auditoria.
//
// Uso:
//   node tests/scripts/smoke-l04-estorno-venda.js --base-url=http://localhost:3001 --db=backend/academia.sqlite
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
async function login(l, senha = PW) {
  const r = await req('POST', '/auth/login', { body: { login: l, senha } });
  if (r.s !== 200) throw new Error(`login ${l}: ${r.s} ${r.code}`);
  return { token: r.j.data.token, user: r.j.data.usuario, login: l };
}

// Fotografia do que um estorno muda: venda, estoque, lancamentos, reversoes,
// estados das solicitacoes e auditoria.
async function foto(vendaId) {
  const venda = await q1('SELECT reversao_controlada_id, produto_id FROM venda_produto WHERE id = ?', [vendaId]);
  const [prod, lanc, rev, est, aud] = await Promise.all([
    q1('SELECT estoque FROM produto WHERE id = ?', [venda.produto_id]),
    q1("SELECT COUNT(*) AS n, ROUND(COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END), 0), 2) AS liquido FROM conta_financeira WHERE deleted_at IS NULL"),
    q1('SELECT COUNT(*) AS n FROM reversao_controlada'),
    qa(`SELECT id, status, aprovado_por, autorizacao_canal, autorizacao_registrada_por, executado_por
        FROM venda_estorno WHERE venda_id = ? ORDER BY id`, [vendaId]),
    q1("SELECT COUNT(*) AS n FROM audit_log WHERE record_type = 'venda_estorno'"),
  ]);
  return JSON.stringify({ venda: venda.reversao_controlada_id, estoque: prod?.estoque, lanc, rev: rev.n, est, aud: aud.n });
}

async function semEfeito(label, vendaId, chamada, status, codigo) {
  const antes = await foto(vendaId);
  const r = await chamada();
  const depois = await foto(vendaId);
  check(`${label} -> ${status}${codigo ? ` ${codigo}` : ''}`, r.s === status && (!codigo || r.code === codigo), `${r.s} ${r.code || ''} ${r.j?.error || ''}`.trim());
  check(`${label}: venda, estoque, lancamentos, estados e auditoria intactos`, antes === depois, antes === depois ? '' : `antes=${antes} depois=${depois}`);
  return r;
}

(async () => {
  grupo('setup');
  const owner = await login('owner');
  const admin = await login('admin.academia');
  const gestor = await login('gestor');
  const financeiro = await login('financeiro');
  const recepcao = await login('recepcao');
  const operador = await login('operador');
  const platform = await login(PLATFORM_LOGIN, PLATFORM_PW);
  const unidades = owner.user.allowedUnits;
  const matriz = Number(unidades.find((u) => u.codigo === 'matriz').id);
  const filial = Number(unidades.find((u) => u.codigo === 'filial').id);
  const id = (s) => Number(s.user.id);

  async function criarUsuario(papel, nome, units) {
    const l = `l04e.${nome}.${RUN}`;
    const r = await req('POST', '/usuarios-internos', { s: owner, unit: matriz, body: { nome: `${nome} L04E`, login: l, senha: PW, papel, unit_ids: units } });
    if (r.s !== 201) throw new Error(`criar ${nome}: ${r.s} ${r.code} ${r.t.slice(0, 120)}`);
    return { id: Number((r.j?.data || r.j)?.id), sessao: await login(l), login: l };
  }
  const gestor2 = await criarUsuario('gestor', 'gestor2', [matriz]);
  const gestorFilial = await criarUsuario('gestor', 'gestorfilial', [filial]);
  const adminFilial = await criarUsuario('admin', 'adminfilial', [filial]);

  const onboarding = await req('POST', '/onboarding/tenants', {
    s: platform,
    body: {
      tenant_nome: `Rede B L04E ${RUN}`, tenant_documento: `l04e-redeb-${RUN}`, tenant_status: 'ativo',
      unit_nome: 'Unidade B', unit_codigo: 'unidade', admin_nome: 'Owner B L04E', admin_login: `l04e.ownerb.${RUN}`, admin_senha: PW,
    },
  });
  const ownerB = await login(`l04e.ownerb.${RUN}`);
  check('setup: Rede B criada pelo onboarding', onboarding.s === 201, onboarding.s);

  const fd = new FormData(); fd.append('nome', `L04E Produto ${RUN}`); fd.append('preco', '10'); fd.append('estoque', '80');
  const pr = await fetch(`${BASE}/produtos`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'X-Unit-Id': String(matriz) }, body: fd });
  const produto = await pr.json();
  check('setup: produto R$ 10 com estoque 80 na Matriz', pr.status === 201 && produto.id, pr.status);

  async function vender(qtd) {
    const r = await req('POST', '/vendas-produtos', { s: owner, unit: matriz, body: { produto_id: produto.id, quantidade: qtd } });
    if (r.s !== 201) throw new Error(`venda: ${r.s} ${r.code}`);
    return r.j;
  }
  const estoque = async () => (await q1('SELECT estoque FROM produto WHERE id = ?', [produto.id])).estoque;
  const liquido = async () => (await q1("SELECT ROUND(COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END), 0), 2) AS l FROM conta_financeira WHERE deleted_at IS NULL")).l;
  const solicitar = (s, vendaId, motivo = 'Cliente devolveu', unit) => req('POST', `/vendas-produtos/${vendaId}/estornos`, { s, unit, body: { motivo } });
  const aprovar = (s, eid, unit, alias = 'vendas-produtos') => req('POST', `/${alias}/estornos/${eid}/aprovar`, { s, unit });
  const externa = (s, eid, body, unit, alias = 'vendas-produtos') => req('POST', `/${alias}/estornos/${eid}/autorizacao-externa`, { s, unit, body });
  const executar = (s, eid, itens, unit, alias = 'vendas-produtos') => req('POST', `/${alias}/estornos/${eid}/executar`, { s, unit, body: { itens } });
  const item = (quantidade) => [{ produto_id: produto.id, quantidade_reposta: quantidade }];
  const agoraISO = () => new Date().toISOString();
  // Horario de parede no fuso da unidade, como o formulario envia (horas e minutos).
  const parede = (instante) => {
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(instante);
    const v = (tipo) => partes.find((x) => x.type === tipo).value;
    return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
  };
  const autExt = (autorizadorId, canal, referencia, autorizadoEm = agoraISO()) => ({ autorizador_id: autorizadorId, canal, referencia, autorizado_em: autorizadoEm });
  const politica = (s, contas, unit = matriz) => req('PATCH', '/vendas-produtos/estornos/politica', { s, unit, body: { contas_distintas: contas } });

  // ===================================================================
  grupo('Permissoes por etapa');
  const v1 = await vender(3);
  await semEfeito('operador de acesso solicita', v1.id, () => solicitar(operador, v1.id), 403, 'PERMISSAO_NEGADA');
  await semEfeito('suporte da plataforma solicita', v1.id, () => solicitar(platform, v1.id, 'x', matriz), 403, 'PERMISSAO_NEGADA');
  await semEfeito('atendente solicita sem motivo', v1.id, () => solicitar(recepcao, v1.id, '   '), 400, 'MOTIVO_OBRIGATORIO');
  let r = await solicitar(recepcao, v1.id, 'Cliente devolveu 3 unidades');
  const e1 = r.j;
  check('atendente (recepcao) solicita com motivo -> 201 solicitada, com autor e horario', r.s === 201 && e1?.status === 'solicitada'
    && e1.solicitado_por === String(id(recepcao)) && e1.solicitado_por_papel === 'recepcao' && Boolean(e1.solicitado_em)
    && e1.venda_id === v1.id && Number(e1.valor_estornado) === 30, r.j && { status: e1.status, por: e1.solicitado_por });
  await semEfeito('atendente aprova no sistema', v1.id, () => aprovar(recepcao, e1.id), 403, 'PERMISSAO_NEGADA');
  await semEfeito('financeiro aprova no sistema', v1.id, () => aprovar(financeiro, e1.id), 403, 'PERMISSAO_NEGADA');
  await semEfeito('gestor registra autorizacao externa', v1.id, () => externa(gestor, e1.id, autExt(id(owner), 'whatsapp', 'msg')), 403, 'PERMISSAO_NEGADA');
  await semEfeito('gestor executa', v1.id, () => executar(gestor, e1.id, item(1)), 403, 'PERMISSAO_NEGADA');
  r = await req('GET', '/vendas-produtos/estornos', { s: operador });
  check('operador de acesso lista estornos -> 403', r.s === 403, `${r.s} ${r.code}`);
  r = await req('GET', '/vendas-produtos/estornos/autorizadores', { s: gestor });
  check('gestor lista autorizadores (nao registra autorizacao externa) -> 403', r.s === 403, `${r.s} ${r.code}`);
  for (const [nome, s] of [['gestor', gestor], ['financeiro', financeiro], ['admin', admin]]) {
    const v = await vender(1);
    r = await solicitar(s, v.id, `Solicitado pelo ${nome}`);
    check(`${nome} tambem pode solicitar -> 201`, r.s === 201 && r.j?.solicitado_por === String(id(s)), `${r.s} ${r.code || ''}`);
  }

  // ===================================================================
  grupo('Pedido unico por venda');
  const antesDup = await foto(v1.id);
  r = await solicitar(recepcao, v1.id, 'Reenvio do mesmo pedido');
  check('reenvio pelo atendente -> 200 com o pedido existente e Idempotent-Replayed', r.s === 200 && r.j?.id === e1.id
    && r.j?.pedido_existente === true && r.h.get('idempotent-replayed') === 'true' && r.j?.motivo === 'Cliente devolveu 3 unidades', `${r.s} ${r.j?.id}`);
  r = await solicitar(gestor, v1.id, 'Outro operador pede o mesmo estorno');
  check('solicitacao de outra conta para a mesma venda -> 200 com o pedido existente', r.s === 200 && r.j?.id === e1.id && r.j?.solicitado_por === String(id(recepcao)), `${r.s} ${r.j?.id}`);
  check('reenvios nao criam pedido nem auditoria', antesDup === await foto(v1.id));
  const vPar = await vender(1);
  const parSol = await Promise.all([solicitar(recepcao, vPar.id, 'Paralelo A'), solicitar(gestor, vPar.id, 'Paralelo B'), solicitar(financeiro, vPar.id, 'Paralelo C')]);
  const idsSol = new Set(parSol.map((x) => x.j?.id));
  check('tres solicitacoes concorrentes -> 1 criada (201) e 2 apontam para ela (200)', idsSol.size === 1
    && parSol.filter((x) => x.s === 201).length === 1 && parSol.filter((x) => x.s === 200).length === 2, parSol.map((x) => `${x.s}#${x.j?.id}`).join(' | '));
  check('um unico pedido ativo na base', (await qa("SELECT id FROM venda_estorno WHERE venda_id = ? AND status IN ('solicitada','aprovada')", [vPar.id])).length === 1);

  // ===================================================================
  grupo('Execucao sem aprovacao');
  await semEfeito('atendente executa pedido nao aprovado', v1.id, () => executar(recepcao, e1.id, item(1)), 409, 'REVERSAO_APROVACAO_NECESSARIA');
  await semEfeito('alias /vendasProdutos executa sem aprovacao', v1.id, () => executar(financeiro, e1.id, item(1), undefined, 'vendasProdutos'), 409, 'REVERSAO_APROVACAO_NECESSARIA');
  for (const rota of [`/vendas-produtos/${v1.id}/reverter`, `/vendasProdutos/${v1.id}/reverter`, `/reversoes/vendas/${v1.id}`]) {
    await semEfeito(`reversao direta legada ${rota}`, v1.id, () => req('POST', rota, { s: owner, unit: matriz, body: { motivo: 'direto' } }), 409, 'REVERSAO_APROVACAO_NECESSARIA');
  }

  // ===================================================================
  grupo('Escopo de Rede e Unidade');
  await semEfeito('owner da Rede B aprova pedido da Rede A', v1.id, () => aprovar(ownerB, e1.id), 404, 'ESTORNO_NAO_ENCONTRADO');
  await semEfeito('owner com a Filial selecionada aprova pedido da Matriz', v1.id, () => aprovar(owner, e1.id, filial), 404, 'ESTORNO_NAO_ENCONTRADO');
  await semEfeito('admin so da Filial seleciona a Matriz para aprovar', v1.id, () => aprovar(adminFilial.sessao, e1.id, matriz), 403, 'UNIT_FORBIDDEN');
  await semEfeito('gestor so da Filial aprova na propria unidade um pedido da Matriz', v1.id, () => aprovar(gestorFilial.sessao, e1.id), 404, 'ESTORNO_NAO_ENCONTRADO');
  await semEfeito('atendente (so Matriz) seleciona a Filial para executar', v1.id, () => executar(recepcao, e1.id, item(1), filial), 403, 'UNIT_FORBIDDEN');
  await semEfeito('atendente seleciona a Filial para solicitar', v1.id, () => solicitar(recepcao, v1.id, 'outra unidade', filial), 403, 'UNIT_FORBIDDEN');
  await semEfeito('autorizacao externa de gestor so da Filial', v1.id, () => externa(recepcao, e1.id, autExt(gestorFilial.id, 'whatsapp', 'Grupo Matriz 10:02')), 422, 'AUTORIZADOR_SEM_PERMISSAO');
  await semEfeito('autorizacao externa do dono da Rede B', v1.id, () => externa(recepcao, e1.id, autExt(id(ownerB), 'email', 'Assunto: estorno')), 422, 'AUTORIZADOR_SEM_PERMISSAO');
  await semEfeito('autorizacao externa de conta sem permissao de aprovar (financeiro)', v1.id, () => externa(recepcao, e1.id, autExt(id(financeiro), 'whatsapp', 'msg 1')), 422, 'AUTORIZADOR_SEM_PERMISSAO');
  await semEfeito('autorizacao externa de conta inexistente', v1.id, () => externa(recepcao, e1.id, autExt(999999, 'whatsapp', 'msg 1')), 422, 'AUTORIZADOR_SEM_PERMISSAO');
  await semEfeito('owner da Rede B registra autorizacao externa no pedido da Rede A', v1.id, () => externa(ownerB, e1.id, autExt(id(owner), 'email', 'msg')), 404, 'ESTORNO_NAO_ENCONTRADO');
  r = await req('GET', '/vendas-produtos/estornos', { s: ownerB });
  check('owner da Rede B nao ve pedidos da Rede A', r.s === 200 && !r.j.some((x) => x.id === e1.id), `${r.s} ${r.j?.length}`);
  r = await req('GET', '/vendas-produtos/estornos/autorizadores', { s: recepcao });
  const autIds = (r.j || []).map((x) => Number(x.id));
  check('autorizadores da Matriz para o atendente: gestor, admin e dono; sem a propria conta, financeiro ou contas da Filial',
    r.s === 200 && autIds.includes(id(gestor)) && autIds.includes(id(admin)) && autIds.includes(id(owner))
      && !autIds.includes(id(recepcao)) && !autIds.includes(id(financeiro)) && !autIds.includes(gestorFilial.id) && !autIds.includes(adminFilial.id),
    `${r.s} ${autIds.length}`);
  r = await req('GET', '/vendas-produtos/estornos/autorizadores', { s: owner, unit: matriz });
  check('o dono nao aparece na propria lista de autorizadores', r.s === 200 && !(r.j || []).some((x) => Number(x.id) === id(owner)), r.s);

  // ===================================================================
  grupo('Autoaprovacao e autoautorizacao');
  await semEfeito('atendente informa a propria conta como autorizadora', v1.id, () => externa(recepcao, e1.id, autExt(id(recepcao), 'whatsapp', 'msg')), 403, 'AUTOAUTORIZACAO_PROIBIDA');
  const vGest = await vender(1);
  const eGest = (await solicitar(gestor, vGest.id, 'Gestor solicita')).j;
  await semEfeito('gestor aprova o proprio pedido', vGest.id, () => aprovar(gestor, eGest.id), 403, 'AUTOAPROVACAO_PROIBIDA');
  await semEfeito('atendente registra autorizacao externa do proprio solicitante', vGest.id, () => externa(recepcao, eGest.id, autExt(id(gestor), 'whatsapp', 'msg')), 403, 'AUTOAPROVACAO_PROIBIDA');
  await semEfeito('dono registra autorizacao externa em nome proprio', vGest.id, () => externa(owner, eGest.id, autExt(id(owner), 'email', 'msg'), matriz), 403, 'AUTOAUTORIZACAO_PROIBIDA');
  const v2 = await vender(1);
  const e2 = (await solicitar(gestor2.sessao, v2.id, 'Produto errado')).j;
  r = await req('PATCH', `/usuarios-internos/${gestor2.id}/papel`, { s: owner, unit: matriz, body: { papel: 'admin' } });
  check('owner promove gestor2 a admin', r.s === 200, `${r.s} ${r.code || ''}`);
  const gestor2Admin = await login(gestor2.login);
  await semEfeito('gestor2, agora admin, aprova a propria solicitacao', v2.id, () => aprovar(gestor2Admin, e2.id), 403, 'AUTOAPROVACAO_PROIBIDA');
  await semEfeito('gestor2 (admin) registra autorizacao externa no proprio pedido informando a si mesmo', v2.id,
    () => externa(gestor2Admin, e2.id, autExt(gestor2.id, 'email', 'msg')), 403, 'AUTOAUTORIZACAO_PROIBIDA');
  r = await externa(gestor2Admin, e2.id, autExt(id(gestor), 'email', 'E-mail do gestor 11/11 18:40'));
  check('gestor2 (admin) registra autorizacao externa de outro gestor no proprio pedido -> 200', r.s === 200 && r.j?.aprovado_por === String(id(gestor)), `${r.s} ${r.code || ''}`);
  r = await executar(gestor2Admin, e2.id, item(1));
  check('gestor2 (admin) executa o proprio pedido autorizado por outro gestor (fluxo padrao) -> 200', r.s === 200, `${r.s} ${r.code || ''}`);

  // ===================================================================
  grupo('Validacao da autorizacao externa');
  const vVal = await vender(1);
  const eVal = (await solicitar(recepcao, vVal.id, 'Validacao')).j;
  const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  for (const [label, body, code] of [
    ['canal sms', autExt(id(gestor), 'sms', 'msg'), 'CANAL_AUTORIZACAO_INVALIDO'],
    ['sem canal', { autorizador_id: id(gestor), referencia: 'msg', autorizado_em: agoraISO() }, 'CANAL_AUTORIZACAO_INVALIDO'],
    ['sem referencia', autExt(id(gestor), 'whatsapp', ''), 'REFERENCIA_AUTORIZACAO_OBRIGATORIA'],
    ['sem data', { autorizador_id: id(gestor), canal: 'whatsapp', referencia: 'msg' }, 'DATA_AUTORIZACAO_INVALIDA'],
    ['data inexistente (30/02)', autExt(id(gestor), 'whatsapp', 'msg', '2026-02-30T10:00'), 'DATA_AUTORIZACAO_INVALIDA'],
    ['hora inexistente (24:00)', autExt(id(gestor), 'whatsapp', 'msg', '2026-11-12T24:00'), 'DATA_AUTORIZACAO_INVALIDA'],
    ['data no futuro (ISO)', autExt(id(gestor), 'whatsapp', 'msg', futuro), 'DATA_AUTORIZACAO_INVALIDA'],
    ['data no futuro (horario do formulario)', autExt(id(gestor), 'whatsapp', 'msg', parede(new Date(Date.now() + 2 * 60 * 1000))), 'DATA_AUTORIZACAO_INVALIDA'],
    ['data anterior a venda (ISO)', autExt(id(gestor), 'whatsapp', 'msg', '2020-01-01T10:00:00Z'), 'DATA_AUTORIZACAO_INVALIDA'],
    ['data anterior a venda (horario do formulario)', autExt(id(gestor), 'whatsapp', 'msg', '2020-01-01T10:00'), 'DATA_AUTORIZACAO_INVALIDA'],
    ['sem autorizador', { canal: 'whatsapp', referencia: 'msg', autorizado_em: agoraISO() }, 'AUTORIZADOR_OBRIGATORIO'],
  ]) {
    await semEfeito(`autorizacao externa com ${label}`, vVal.id, () => externa(recepcao, eVal.id, body), 400, code);
  }

  // ===================================================================
  grupo('Aprovacao direta do gestor e execucao pelo atendente');
  r = await aprovar(gestor, e1.id);
  check('gestor aprova no sistema o pedido do atendente -> 200, canal sistema', r.s === 200 && r.j?.status === 'aprovada'
    && r.j.aprovado_por === String(id(gestor)) && r.j.autorizacao_canal === 'sistema' && !r.j.autorizacao_registrada_por && Boolean(r.j.aprovado_em), `${r.s} ${r.code || ''}`);
  await semEfeito('aprovar de novo', v1.id, () => aprovar(owner, e1.id, matriz), 409, 'ESTORNO_JA_APROVADO');
  await semEfeito('registrar autorizacao externa num pedido ja aprovado', v1.id, () => externa(recepcao, e1.id, autExt(id(admin), 'whatsapp', 'msg')), 409, 'ESTORNO_JA_APROVADO');
  for (const [label, itens] of [
    ['quantidade -1', item(-1)],
    ['quantidade 4 (vendeu 3)', item(4)],
    ['quantidade 1.5', item(1.5)],
    ['quantidade "1" (texto)', [{ produto_id: produto.id, quantidade_reposta: '1' }]],
    ['sem itens', undefined],
    ['item de outro produto', [{ produto_id: produto.id + 999, quantidade_reposta: 1 }]],
    ['dois itens para venda de um item', [...item(1), ...item(1)]],
  ]) {
    await semEfeito(`execucao com ${label}`, v1.id, () => executar(recepcao, e1.id, itens), 400, 'QUANTIDADE_REPOSTA_INVALIDA');
  }
  const estoqueAntes = await estoque();
  const liquidoAntes = await liquido();
  r = await executar(recepcao, e1.id, item(1));
  const ex1 = r.j;
  check('atendente executa com 1 de 3 unidades recebidas -> 200 (mesma conta que solicitou)', r.s === 200 && ex1?.estorno?.status === 'executada', `${r.s} ${r.code || ''} ${r.j?.error || ''}`);
  check('estoque reposto so em 1', (await estoque()) === estoqueAntes + 1, `${estoqueAntes} -> ${await estoque()}`);
  check('contrapartida do valor integral (R$ 30), despesa, origem reversao_controlada',
    ex1?.lancamento_inverso && Number(ex1.lancamento_inverso.valor) === 30 && ex1.lancamento_inverso.tipo === 'despesa' && ex1.lancamento_inverso.origem === 'reversao_controlada',
    ex1?.lancamento_inverso);
  check('efeito financeiro liquido de -R$ 30', Math.round((liquidoAntes - await liquido()) * 100) === 3000);
  const ev = await q1('SELECT * FROM venda_estorno WHERE id = ?', [e1.id]);
  check('estado gravado: solicitante, autorizador e executor com horarios', ev.solicitado_por === String(id(recepcao))
    && ev.aprovado_por === String(id(gestor)) && ev.executado_por === String(id(recepcao))
    && ev.solicitado_em && ev.aprovado_em && ev.executado_em && ev.quantidade_reposta === 1 && ev.reversao_controlada_id && ev.lancamento_inverso_id
    && ev.contas_distintas_exigidas === 0, { aprov: ev.aprovado_por, exec: ev.executado_por });
  check('venda marcada como estornada', (await q1('SELECT reversao_controlada_id FROM venda_produto WHERE id = ?', [v1.id])).reversao_controlada_id === ev.reversao_controlada_id);
  let aud = await q1("SELECT metadata_json FROM audit_log WHERE action = 'executar_estorno_venda' AND record_id = ?", [String(e1.id)]);
  let meta = aud ? JSON.parse(aud.metadata_json || '{}') : {};
  check('auditoria da execucao: vendida 3, reposta 1, fora 2, valor 30, solicitante, autorizador (sistema) e executor',
    meta.quantidade_vendida === 3 && meta.quantidade_reposta === 1 && meta.quantidade_fora_do_estoque === 2 && meta.valor_estornado === 30
      && meta.solicitante?.id === String(id(recepcao)) && meta.autorizador?.id === String(id(gestor)) && meta.autorizador?.canal === 'sistema'
      && meta.autorizador?.declarada_pelo_operador === false && meta.registrado_por === null && meta.executor?.id === String(id(recepcao)) && Boolean(meta.executor?.em),
    meta);
  const auds = await qa("SELECT action FROM audit_log WHERE record_type = 'venda_estorno' AND record_id = ? ORDER BY id", [String(e1.id)]);
  check('auditoria das tres etapas', JSON.stringify(auds.map((a) => a.action)) === JSON.stringify(['solicitar_estorno_venda', 'aprovar_estorno_venda', 'executar_estorno_venda']), auds.map((a) => a.action));

  // ===================================================================
  grupo('Autorizacao externa por WhatsApp e e-mail');
  const vW = await vender(2);
  const eW = (await solicitar(recepcao, vW.id, 'Cliente desistiu no balcao')).j;
  // Horario como o formulario envia: horas e minutos no fuso da unidade.
  const quandoW = parede(new Date());
  r = await externa(recepcao, eW.id, autExt(id(gestor), 'whatsapp', 'Grupo Equipe Matriz, 10:42, "pode estornar"', quandoW));
  check('atendente registra autorizacao do gestor por WhatsApp -> 200 aprovada', r.s === 200 && r.j?.status === 'aprovada'
    && r.j.aprovado_por === String(id(gestor)) && r.j.aprovado_por_papel === 'gestor' && r.j.autorizacao_canal === 'whatsapp'
    && r.j.autorizacao_registrada_por === String(id(recepcao)) && Boolean(r.j.autorizacao_registrada_em)
    && parede(new Date(r.j.aprovado_em)) === quandoW && r.j.aprovado_em.endsWith(':00.000Z') && r.j.autorizacao_referencia.startsWith('Grupo Equipe Matriz'), `${r.s} ${r.code || ''} ${r.j?.error || ''} ${r.j?.aprovado_em}`);
  aud = await q1("SELECT metadata_json FROM audit_log WHERE action = 'registrar_autorizacao_externa_estorno_venda' AND record_id = ?", [String(eW.id)]);
  meta = aud ? JSON.parse(aud.metadata_json || '{}') : {};
  check('auditoria do registro: declarada pelo operador, autorizador, registrante e horarios', meta.declarada_pelo_operador === true
    && meta.canal === 'whatsapp' && meta.autorizador?.id === String(id(gestor)) && meta.autorizador?.em_informado === quandoW && meta.autorizador?.comparacao === 'minuto'
    && meta.registrado_por?.id === String(id(recepcao)) && Boolean(meta.registrado_por?.em) && meta.solicitante?.id === String(id(recepcao)), meta);
  const estW = await estoque();
  r = await executar(recepcao, eW.id, item(2));
  check('o mesmo atendente executa (solicitou, registrou e executa) -> 200, repoe 2', r.s === 200 && (await estoque()) === estW + 2, `${r.s} ${r.code || ''}`);
  aud = await q1("SELECT metadata_json FROM audit_log WHERE action = 'executar_estorno_venda' AND record_id = ?", [String(eW.id)]);
  meta = aud ? JSON.parse(aud.metadata_json || '{}') : {};
  check('auditoria da execucao distingue solicitante, autorizador externo, registrante e executor', meta.solicitante?.id === String(id(recepcao))
    && meta.autorizador?.id === String(id(gestor)) && meta.autorizador?.canal === 'whatsapp' && meta.autorizador?.declarada_pelo_operador === true
    && meta.registrado_por?.id === String(id(recepcao)) && meta.executor?.id === String(id(recepcao)), meta);

  const vE = await vender(1);
  const eE = (await solicitar(recepcao, vE.id, 'Cobranca em duplicidade')).j;
  r = await externa(financeiro, eE.id, autExt(id(owner), 'email', 'E-mail "Estorno venda" de 12/11 09:15'));
  check('financeiro registra autorizacao do dono por e-mail -> 200', r.s === 200 && r.j?.autorizacao_canal === 'email'
    && r.j.aprovado_por === String(id(owner)) && r.j.autorizacao_registrada_por === String(id(financeiro)), `${r.s} ${r.code || ''}`);
  r = await req('GET', `/vendasProdutos/estornos?venda_id=${vE.id}`, { s: recepcao });
  const linhaE = r.j?.[0];
  check('detalhe pelo alias mostra origem externa e quem atuou em cada etapa', r.s === 200 && linhaE?.autorizacao_canal === 'email'
    && linhaE.solicitado_por_nome && linhaE.aprovado_por_nome && linhaE.autorizacao_registrada_por_nome, linhaE && {
    canal: linhaE.autorizacao_canal, sol: linhaE.solicitado_por_nome, aut: linhaE.aprovado_por_nome, reg: linhaE.autorizacao_registrada_por_nome });
  r = await executar(recepcao, eE.id, item(0));
  check('atendente executa com reposicao zero -> 200', r.s === 200 && r.j?.quantidade_reposta === 0 && Number(r.j?.lancamento_inverso?.valor) === 10, `${r.s} ${r.code || ''}`);

  // ===================================================================
  grupo('Concorrencia entre aprovacao direta e autorizacao externa');
  const vC = await vender(1);
  const eC = (await solicitar(recepcao, vC.id, 'Corrida')).j;
  const corrida = await Promise.all([aprovar(admin, eC.id), externa(recepcao, eC.id, autExt(id(gestor), 'whatsapp', 'msg corrida'))]);
  check('aprovacao direta e registro externo simultaneos -> 1 aceito, 1 recusado 409', corrida.filter((x) => x.s === 200).length === 1
    && corrida.filter((x) => x.s === 409).length === 1, corrida.map((x) => `${x.s} ${x.code || ''}`).join(' | '));
  const rowC = await q1('SELECT aprovado_por, autorizacao_canal FROM venda_estorno WHERE id = ?', [eC.id]);
  check('o pedido guarda uma unica autorizacao coerente', (rowC.autorizacao_canal === 'sistema' && rowC.aprovado_por === String(id(admin)))
    || (rowC.autorizacao_canal === 'whatsapp' && rowC.aprovado_por === String(id(gestor))), rowC);

  const vP = await vender(1);
  const eP = (await solicitar(recepcao, vP.id, 'Paralelo')).j;
  await aprovar(gestor, eP.id);
  const estP = await estoque();
  const lancP = (await q1("SELECT COUNT(*) AS n FROM conta_financeira WHERE origem = 'reversao_controlada'")).n;
  const tres = await Promise.all([executar(recepcao, eP.id, item(1)), executar(financeiro, eP.id, item(1)), executar(owner, eP.id, item(1), matriz, 'vendasProdutos')]);
  check('mesma aprovacao executada 3 vezes em paralelo -> 1 aceita, 2 ESTORNO_JA_EXECUTADO',
    tres.filter((x) => x.s === 200).length === 1 && tres.filter((x) => x.code === 'ESTORNO_JA_EXECUTADO').length === 2,
    tres.map((x) => `${x.s} ${x.code || ''}`).join(' | '));
  check('estoque reposto uma vez e uma contrapartida', (await estoque()) === estP + 1
    && (await q1("SELECT COUNT(*) AS n FROM conta_financeira WHERE origem = 'reversao_controlada'")).n === lancP + 1);

  // ===================================================================
  grupo('Repeticao');
  await semEfeito('executar de novo a mesma aprovacao', v1.id, () => executar(financeiro, e1.id, item(1)), 409, 'ESTORNO_JA_EXECUTADO');
  await semEfeito('executar pelo alias /vendasProdutos', v1.id, () => executar(owner, e1.id, item(1), matriz, 'vendasProdutos'), 409, 'ESTORNO_JA_EXECUTADO');
  await semEfeito('solicitar estorno de venda ja estornada', v1.id, () => solicitar(recepcao, v1.id), 409, 'VENDA_JA_REVERTIDA');

  // ===================================================================
  grupo('Periodo fechado e reabertura');
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date());
  const [ano, mes] = fmt.split('-').map(Number);
  const v4 = await vender(2);
  const v5 = await vender(1);
  const e4 = (await solicitar(recepcao, v4.id, 'Antes do fechamento')).j;
  r = await req('POST', `/fechamento-mensal/${ano}/${mes}/fechar`, { s: owner, unit: matriz });
  check(`setup: ${mes}/${ano} fechado na Matriz`, r.s === 200 && String(r.j?.fechamento?.status).startsWith('fechado'), `${r.s} ${r.j?.fechamento?.status}`);
  r = await solicitar(recepcao, v5.id, 'Solicitado com mes fechado');
  const e5 = r.j;
  check('solicitar com o mes fechado -> 201', r.s === 201, `${r.s} ${r.code || ''}`);
  r = await externa(recepcao, e5.id, autExt(id(gestor), 'whatsapp', 'Autorizado com mes fechado'));
  check('registrar autorizacao externa com o mes fechado -> 200', r.s === 200 && r.j?.status === 'aprovada', `${r.s} ${r.code || ''}`);
  r = await aprovar(gestor, e4.id);
  check('aprovar com o mes fechado -> 200', r.s === 200 && r.j?.status === 'aprovada', `${r.s} ${r.code || ''}`);
  await semEfeito('executar com o mes da venda e do estorno fechado', v4.id, () => executar(recepcao, e4.id, item(2)), 423, 'PERIODO_FECHADO');
  check('aprovacao continua disponivel apos a recusa', (await q1('SELECT status, aprovado_por FROM venda_estorno WHERE id = ?', [e4.id])).status === 'aprovada');
  r = await req('POST', `/fechamento-mensal/${ano}/${mes}/reabrir`, { s: owner, unit: matriz, body: { motivo: 'L04E: estorno pendente' } });
  check('owner reabre o mes com motivo', r.s === 200, `${r.s} ${r.code || ''}`);
  const est4 = await estoque();
  r = await executar(recepcao, e4.id, item(2));
  check('nova tentativa apos reabertura -> 200, repoe 2', r.s === 200 && (await estoque()) === est4 + 2, `${r.s} ${r.code || ''}`);

  // ===================================================================
  grupo('Opcao da unidade: tres contas distintas');
  r = await req('GET', '/vendas-produtos/estornos/politica', { s: recepcao });
  check('politica padrao: contas distintas desligada', r.s === 200 && r.j?.contas_distintas === false, `${r.s} ${JSON.stringify(r.j)}`);
  r = await politica(admin, true);
  check('admin tenta ligar a opcao -> 403 (so o dono)', r.s === 403 && r.code === 'PERMISSAO_NEGADA', `${r.s} ${r.code}`);
  r = await politica(owner, 'sim');
  check('valor invalido -> 400', r.s === 400 && r.code === 'POLITICA_ESTORNO_INVALIDA', `${r.s} ${r.code}`);
  r = await politica(owner, true);
  check('dono liga a opcao na Matriz -> 200', r.s === 200 && r.j?.contas_distintas === true, `${r.s} ${r.code || ''}`);
  const audPol = await q1("SELECT after_json FROM audit_log WHERE action = 'configurar_politica_estorno_venda' ORDER BY id DESC LIMIT 1");
  check('mudanca de politica auditada', Boolean(audPol) && String(audPol.after_json).includes('"estorno_venda_contas_distintas":1'), audPol);
  r = await req('GET', '/vendas-produtos/estornos/politica', { s: gestorFilial.sessao });
  check('a Filial continua no fluxo padrao', r.s === 200 && r.j?.contas_distintas === false, JSON.stringify(r.j));

  // Atendente solicita, registra a autorizacao do gestor e tenta executar.
  const vT1 = await vender(1);
  const eT1 = (await solicitar(recepcao, vT1.id, 'Tres contas A')).j;
  r = await externa(recepcao, eT1.id, autExt(id(gestor), 'whatsapp', 'Grupo 14:00'));
  check('registro externo segue permitido (registrante e solicitante podem coincidir)', r.s === 200, `${r.s} ${r.code || ''}`);
  await semEfeito('solicitante executa com a opcao ligada', vT1.id, () => executar(recepcao, eT1.id, item(1)), 403, 'CONTAS_DISTINTAS_EXIGIDAS');
  r = await executar(financeiro, eT1.id, item(1));
  check('terceira conta (financeiro) executa -> 200', r.s === 200 && r.j?.estorno?.contas_distintas_exigidas === 1, `${r.s} ${r.code || ''}`);
  aud = await q1("SELECT metadata_json FROM audit_log WHERE action = 'executar_estorno_venda' AND record_id = ?", [String(eT1.id)]);
  meta = aud ? JSON.parse(aud.metadata_json || '{}') : {};
  check('auditoria registra a opcao e o registrante a parte', meta.contas_distintas_exigidas === true && meta.registrado_por?.id === String(id(recepcao))
    && meta.solicitante?.id === String(id(recepcao)) && meta.autorizador?.id === String(id(gestor)) && meta.executor?.id === String(id(financeiro)), meta);

  // Autorizador externo tentando executar: financeiro registra a autorizacao do
  // dono e o dono tenta executar.
  const vT2 = await vender(1);
  const eT2 = (await solicitar(recepcao, vT2.id, 'Tres contas B')).j;
  await externa(financeiro, eT2.id, autExt(id(owner), 'email', 'E-mail 15:10'));
  await semEfeito('autorizador externo (dono) executa com a opcao ligada', vT2.id, () => executar(owner, eT2.id, item(0), matriz), 403, 'CONTAS_DISTINTAS_EXIGIDAS');
  r = await executar(financeiro, eT2.id, item(0));
  check('quem registrou a autorizacao (financeiro) pode executar, sendo terceira conta -> 200', r.s === 200, `${r.s} ${r.code || ''}`);

  // Aprovacao direta: aprovador tenta executar.
  const vT3 = await vender(1);
  const eT3 = (await solicitar(financeiro, vT3.id, 'Tres contas C')).j;
  await aprovar(admin, eT3.id);
  await semEfeito('aprovador direto (admin) executa com a opcao ligada', vT3.id, () => executar(admin, eT3.id, item(1)), 403, 'CONTAS_DISTINTAS_EXIGIDAS');
  await semEfeito('solicitante (financeiro) executa com a opcao ligada', vT3.id, () => executar(financeiro, eT3.id, item(1)), 403, 'CONTAS_DISTINTAS_EXIGIDAS');
  r = await executar(recepcao, eT3.id, item(1));
  check('atendente como terceira conta executa -> 200', r.s === 200, `${r.s} ${r.code || ''}`);

  // A opcao vale no momento da execucao.
  r = await politica(owner, false);
  check('dono desliga a opcao -> 200', r.s === 200 && r.j?.contas_distintas === false, r.s);
  const vT4 = await vender(1);
  const eT4 = (await solicitar(recepcao, vT4.id, 'Volta ao padrao')).j;
  await aprovar(gestor, eT4.id);
  r = await executar(recepcao, eT4.id, item(1));
  check('com a opcao desligada o solicitante volta a poder executar -> 200', r.s === 200, `${r.s} ${r.code || ''}`);

  // ===================================================================
  grupo('Estado visivel');
  r = await req('GET', '/vendas-produtos?limite=80', { s: owner, unit: matriz });
  const linha = (vid) => (r.j?.vendas || []).find((v) => v.id === vid);
  check('listagem de vendas mostra o estado do estorno', linha(v1.id)?.estorno_status === 'executada' && linha(vVal.id)?.estorno_status === 'solicitada'
    && linha(v5.id)?.estorno_status === 'aprovada', { v1: linha(v1.id)?.estorno_status, vVal: linha(vVal.id)?.estorno_status, v5: linha(v5.id)?.estorno_status });
  r = await req('GET', '/vendasProdutos/estornos?status=solicitada,aprovada', { s: financeiro });
  check('fila pelo alias /vendasProdutos/estornos com filtro de estado', r.s === 200 && r.j.every((x) => ['solicitada', 'aprovada'].includes(x.status)) && r.j.some((x) => x.venda_id === v5.id),
    `${r.s} ${r.j?.length}`);

  console.log('\nResumo por grupo:');
  let falhas = 0;
  for (const [nome, x] of Object.entries(resultados)) {
    falhas += x.falhas;
    console.log(`  ${nome}: ${x.ok}/${x.ok + x.falhas} OK`);
  }
  const total = Object.values(resultados).reduce((a, x) => a + x.ok + x.falhas, 0);
  console.log(`\n[smoke-l04-estorno-venda] ${total - falhas}/${total} verificacoes OK`);
  db.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('[ERRO]', e);
  db.close();
  process.exit(1);
});
