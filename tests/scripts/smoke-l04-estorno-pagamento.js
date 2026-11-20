// Smoke L04 · Estorno de pagamento do aluno (sublote A; decisoes de 16/11 e 20/11/2026).
//
// Base DESCARTAVEL criada com `npm run db:seed:dev` e a API rodando sobre ela.
// O smoke cria alunos "L04A ...", mensalidades e pagamentos na Matriz, fecha e
// reabre o mes corrente, liga e desliga a opcao de tres contas e le o SQLite
// somente para conferir pagamentos, mensalidades, lancamentos, devolucoes e
// auditoria.
//
// Uso:
//   node tests/scripts/smoke-l04-estorno-pagamento.js --base-url=http://localhost:3001 --db=backend/academia.sqlite
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
async function login(l) {
  const r = await req('POST', '/auth/login', { body: { login: l, senha: PW } });
  if (r.s !== 200) throw new Error(`login ${l}: ${r.s} ${r.code}`);
  return { token: r.j.data.token, user: r.j.data.usuario, login: l };
}
const dado = (r) => r.j?.data || r.j;

// Estado alterado por um estorno de pagamento.
async function foto(pagamentoId) {
  const p = await q1('SELECT id, mensalidade_id, estornado_em, reversao_controlada_id FROM pagamento WHERE id = ?', [pagamentoId]);
  const [m, lanc, est, dev, aud, rev] = await Promise.all([
    q1('SELECT status FROM mensalidade WHERE id = ?', [p.mensalidade_id]),
    q1("SELECT COUNT(*) AS n, ROUND(COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END), 0), 2) AS liquido FROM conta_financeira WHERE deleted_at IS NULL"),
    qa('SELECT id, status, aprovado_por, autorizacao_canal, executado_por FROM pagamento_estorno WHERE pagamento_id = ? ORDER BY id', [pagamentoId]),
    q1('SELECT COUNT(*) AS n FROM pagamento_devolucao WHERE pagamento_id = ?', [pagamentoId]),
    q1("SELECT COUNT(*) AS n FROM audit_log WHERE record_type = 'pagamento_estorno'"),
    q1('SELECT COUNT(*) AS n FROM reversao_controlada'),
  ]);
  return JSON.stringify({ p, m, lanc, est, dev: dev.n, aud: aud.n, rev: rev.n });
}

async function semEfeito(label, pagamentoId, chamada, status, codigo, conferir) {
  const antes = await foto(pagamentoId);
  const r = await chamada();
  const depois = await foto(pagamentoId);
  check(`${label} -> ${status}${codigo ? ` ${codigo}` : ''}`, r.s === status && (!codigo || r.code === codigo) && (!conferir || conferir(r)),
    `${r.s} ${r.code || ''} ${r.j?.error || ''} ${r.j?.details ? JSON.stringify(r.j.details) : ''}`.trim());
  check(`${label}: pagamento, mensalidade, lancamentos, estornos, devolucoes e auditoria intactos`, antes === depois, antes === depois ? '' : `antes=${antes} depois=${depois}`);
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
  const matriz = Number(owner.user.allowedUnits.find((u) => u.codigo === 'matriz').id);
  const filial = Number(owner.user.allowedUnits.find((u) => u.codigo === 'filial').id);
  const id = (s) => String(s.user.id);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const planos = dado(await req('GET', '/planos', { s: owner, unit: matriz }));
  const plano = (Array.isArray(planos) ? planos : []).find((p) => (p.tipo_cobranca || 'AVULSO_MENSAL') === 'AVULSO_MENSAL');
  check('setup: plano mensal avulso disponivel', Boolean(plano), plano?.id);

  let seq = 0;
  // Aluno novo com uma mensalidade de R$ 100 cobrindo hoje, paga pelos meios dados.
  async function alunoPago(pagamentos, nome = 'Mensal') {
    seq += 1;
    const a = await req('POST', '/alunos', { s: owner, unit: matriz, body: { nome: `L04A ${nome} ${seq} ${RUN}`, data_nascimento: '1990-01-01', plano_id: plano.id, dia_vencimento: 10, status: 'ativo' } });
    const aluno = dado(a);
    const m = await req('POST', '/mensalidades', { s: owner, unit: matriz, body: { aluno_id: aluno.id, plano_id: plano.id, vencimento: hoje, valor_cobrado: 100 } });
    const mensalidade = dado(m);
    const pags = [];
    for (const [valor, forma] of pagamentos) {
      const r = await req('POST', '/pagamentos', { s: recepcao, unit: matriz, body: { mensalidade_id: mensalidade.id, valor_pago: valor, ...(forma ? { forma_pagamento: forma } : {}) } });
      if (r.s !== 201) throw new Error(`pagamento: ${r.s} ${r.code}`);
      pags.push(r.j);
    }
    return { aluno, mensalidade, pags };
  }
  const solicitar = (s, pid, motivo = 'Cobrado em duplicidade', unit) => req('POST', `/pagamentos/${pid}/estornos`, { s, unit, body: { motivo } });
  const aprovar = (s, eid, unit) => req('POST', `/pagamentos/estornos/${eid}/aprovar`, { s, unit });
  const externa = (s, eid, body, unit) => req('POST', `/pagamentos/estornos/${eid}/autorizacao-externa`, { s, unit, body });
  const executar = (s, eid, body, unit) => req('POST', `/pagamentos/estornos/${eid}/executar`, { s, unit, body });
  const devolver = (meio, valor, extra = {}) => ({ devolucoes: [{ meio, valor }], devolucao_confirmada: true, ...extra });
  const agoraISO = () => new Date().toISOString();

  // ===================================================================
  grupo('Meio do pagamento');
  const base = await alunoPago([]);
  let r = await req('POST', '/pagamentos', { s: recepcao, unit: matriz, body: { mensalidade_id: base.mensalidade.id, valor_pago: 10, forma_pagamento: 'cheque' } });
  check('forma de pagamento invalida -> 400 FORMA_PAGAMENTO_INVALIDA', r.s === 400 && r.code === 'FORMA_PAGAMENTO_INVALIDA', `${r.s} ${r.code}`);
  check('nada gravado com forma invalida', (await q1('SELECT COUNT(*) AS n FROM pagamento WHERE mensalidade_id = ?', [base.mensalidade.id])).n === 0);
  const m1 = await alunoPago([[60, 'dinheiro'], [40, 'pix']]);
  const [p60, p40] = m1.pags;
  check('pagamentos gravam o meio informado', p60.forma_pagamento === 'dinheiro' && p40.forma_pagamento === 'pix'
    && (await q1('SELECT forma_pagamento FROM pagamento WHERE id = ?', [p60.id])).forma_pagamento === 'dinheiro', [p60.forma_pagamento, p40.forma_pagamento]);
  check('mensalidade quitada com R$ 60 + R$ 40', (await q1('SELECT status FROM mensalidade WHERE id = ?', [m1.mensalidade.id])).status === 'pago');
  r = await req('GET', `/pagamentos/aluno/${m1.aluno.id}`, { s: recepcao });
  check('lista de pagamentos do aluno traz o meio e o estado do estorno', r.s === 200 && r.j.length === 2 && r.j.every((p) => p.forma_pagamento && p.estorno_status === null), r.j?.map((p) => [p.forma_pagamento, p.estorno_status]));

  // ===================================================================
  grupo('Permissoes e pedido unico');
  await semEfeito('operador de acesso solicita', p60.id, () => solicitar(operador, p60.id), 403, 'PERMISSAO_NEGADA');
  await semEfeito('recepcao solicita sem motivo', p60.id, () => solicitar(recepcao, p60.id, '  '), 400, 'MOTIVO_OBRIGATORIO');
  r = await solicitar(recepcao, p60.id, 'Aluno pagou em dobro');
  const e60 = r.j;
  check('recepcao solicita -> 201 com autor, valor e meio original', r.s === 201 && e60.status === 'solicitada' && e60.solicitado_por === id(recepcao)
    && e60.valor_estornado === 60 && e60.meio_original === 'dinheiro' && e60.aluno_id === m1.aluno.id, `${r.s} ${r.code || ''}`);
  r = await solicitar(gestor, p60.id, 'Outro pedido');
  check('gestor pede o mesmo estorno -> 200 com o pedido existente', r.s === 200 && r.j?.id === e60.id && r.h.get('idempotent-replayed') === 'true', `${r.s} ${r.j?.id}`);
  for (const [nome, s] of [['recepcao', recepcao], ['gestor', gestor], ['financeiro', financeiro]]) {
    await semEfeito(`${nome} aprova`, p60.id, () => aprovar(s, e60.id), 403, 'PERMISSAO_NEGADA');
  }
  await semEfeito('recepcao executa', p60.id, () => executar(recepcao, e60.id, devolver('dinheiro', 60)), 403, 'PERMISSAO_NEGADA');
  await semEfeito('gestor executa', p60.id, () => executar(gestor, e60.id, devolver('dinheiro', 60)), 403, 'PERMISSAO_NEGADA');
  for (const [nome, s] of [['gestor', gestor], ['financeiro', financeiro], ['admin', admin], ['owner', owner]]) {
    const extra = await alunoPago([[100, 'pix']]);
    r = await solicitar(s, extra.pags[0].id, `Pedido do ${nome}`, matriz);
    check(`${nome} tambem solicita -> 201`, r.s === 201, `${r.s} ${r.code || ''}`);
  }

  // ===================================================================
  grupo('Execucao sem aprovacao e rota direta');
  await semEfeito('financeiro executa pedido nao aprovado', p60.id, () => executar(financeiro, e60.id, devolver('dinheiro', 60)), 409, 'REVERSAO_APROVACAO_NECESSARIA');
  await semEfeito('rota direta /pagamentos/:id/estornar', p60.id, () => req('POST', `/pagamentos/${p60.id}/estornar`, { s: owner, unit: matriz, body: { motivo: 'direto' } }), 409, 'REVERSAO_APROVACAO_NECESSARIA');

  // ===================================================================
  grupo('Escopo de unidade');
  await semEfeito('owner com a Filial selecionada aprova pedido da Matriz', p60.id, () => aprovar(owner, e60.id, filial), 404, 'ESTORNO_NAO_ENCONTRADO');
  await semEfeito('recepcao seleciona a Filial para solicitar', p60.id, () => solicitar(recepcao, p60.id, 'x', filial), 403, 'UNIT_FORBIDDEN');
  await semEfeito('owner com a Filial selecionada solicita pagamento da Matriz', p60.id, () => solicitar(owner, p60.id, 'x', filial), 404, 'PAGAMENTO_NAO_ENCONTRADO');

  // ===================================================================
  grupo('Autoaprovacao');
  const m2 = await alunoPago([[100, 'cartao_debito']]);
  const eAdm = (await solicitar(admin, m2.pags[0].id, 'Admin pede')).j;
  await semEfeito('admin aprova o proprio pedido', m2.pags[0].id, () => aprovar(admin, eAdm.id), 403, 'AUTOAPROVACAO_PROIBIDA');
  await semEfeito('recepcao registra autorizacao externa do proprio solicitante', m2.pags[0].id,
    () => externa(recepcao, eAdm.id, { autorizador_id: Number(id(admin)), canal: 'whatsapp', referencia: 'Grupo 10:00', autorizado_em: agoraISO() }), 403, 'AUTOAPROVACAO_PROIBIDA');
  await semEfeito('autorizacao externa de quem nao aprova (gestor)', m2.pags[0].id,
    () => externa(recepcao, eAdm.id, { autorizador_id: Number(id(gestor)), canal: 'whatsapp', referencia: 'Grupo 10:00', autorizado_em: agoraISO() }), 422, 'AUTORIZADOR_SEM_PERMISSAO');

  // ===================================================================
  grupo('Aprovacao direta e devolucao pelo meio original');
  r = await aprovar(admin, e60.id);
  check('admin aprova no sistema -> 200', r.s === 200 && r.j?.status === 'aprovada' && r.j.autorizacao_canal === 'sistema', `${r.s} ${r.code || ''}`);
  await semEfeito('executar sem informar a devolucao', p60.id, () => executar(financeiro, e60.id, {}), 422, 'DEVOLUCAO_OBRIGATORIA',
    (x) => JSON.stringify(x.j?.details?.sugestao) === JSON.stringify([{ meio: 'dinheiro', valor: 60 }]));
  await semEfeito('executar sem confirmar a devolucao', p60.id, () => executar(financeiro, e60.id, { devolucoes: [{ meio: 'dinheiro', valor: 60 }] }), 422, 'DEVOLUCAO_NAO_CONFIRMADA');
  await semEfeito('devolucao de R$ 50 (parcial)', p60.id, () => executar(financeiro, e60.id, devolver('dinheiro', 50)), 422, 'DEVOLUCAO_DIFERENTE_DO_TOTAL');
  await semEfeito('devolucao no Pix sem motivo', p60.id, () => executar(financeiro, e60.id, devolver('pix', 60, { comprovante_referencia: 'PIX-1' })), 422, 'MOTIVO_TROCA_MEIO_OBRIGATORIO');
  await semEfeito('devolucao em meio invalido', p60.id, () => executar(financeiro, e60.id, devolver('cheque', 60)), 400, 'PAGAMENTO_MEIO_INVALIDO');
  const liquidoAntes = (await q1("SELECT ROUND(COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END), 0), 2) AS l FROM conta_financeira WHERE deleted_at IS NULL")).l;
  r = await executar(financeiro, e60.id, devolver('dinheiro', 60));
  const ex60 = r.j;
  check('financeiro executa devolvendo R$ 60 em dinheiro -> 200', r.s === 200 && ex60?.estorno?.status === 'executada' && ex60.estorno.devolucao_meio_alternativo === 0, `${r.s} ${r.code || ''} ${r.j?.error || ''}`);
  check('mensalidade volta a parcial com saldo de R$ 60', ex60?.status_mensalidade === 'parcial' && ex60.saldo_em_aberto === 60 && ex60.total_pago === 40, ex60 && [ex60.status_mensalidade, ex60.saldo_em_aberto]);
  check('competencia e cobertura preservadas', ex60?.mensalidade?.vencimento === m1.mensalidade.vencimento && ex60.mensalidade.data_inicio === m1.mensalidade.data_inicio
    && ex60.mensalidade.data_fim === m1.mensalidade.data_fim);
  check('acesso reavaliado: mensal sem quitacao fica bloqueado', ex60?.acesso && ex60.acesso.liberado === false, ex60?.acesso);
  check('contrapartida de R$ 60 na data operacional de hoje', Number(ex60?.lancamento_inverso?.valor) === 60 && ex60.lancamento_inverso.tipo === 'despesa'
    && ex60.lancamento_inverso.data_lancamento === hoje, ex60?.lancamento_inverso && [ex60.lancamento_inverso.valor, ex60.lancamento_inverso.data_lancamento]);
  const liquidoDepois = (await q1("SELECT ROUND(COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END), 0), 2) AS l FROM conta_financeira WHERE deleted_at IS NULL")).l;
  check('efeito financeiro liquido de -R$ 60', Math.round((liquidoAntes - liquidoDepois) * 100) === 6000, [liquidoAntes, liquidoDepois]);
  const pag60 = await q1('SELECT estornado_em, reversao_controlada_id FROM pagamento WHERE id = ?', [p60.id]);
  const pag40 = await q1('SELECT estornado_em FROM pagamento WHERE id = ?', [p40.id]);
  check('so o pagamento escolhido fica estornado', Boolean(pag60.estornado_em && pag60.reversao_controlada_id) && !pag40.estornado_em);
  const dev60 = await qa('SELECT meio, valor_centavos, pagamento_estorno_id FROM pagamento_devolucao WHERE pagamento_id = ?', [p60.id]);
  check('devolucao registrada por meio e ligada ao estorno', dev60.length === 1 && dev60[0].meio === 'dinheiro' && dev60[0].valor_centavos === 6000 && dev60[0].pagamento_estorno_id === e60.id, dev60);
  let aud = JSON.parse((await q1("SELECT metadata_json FROM audit_log WHERE action = 'executar_estorno_pagamento' AND record_id = ?", [String(e60.id)]))?.metadata_json || '{}');
  check('auditoria: solicitante, autorizador, executor, devolucao, status e acesso', aud.solicitante?.id === id(recepcao) && aud.autorizador?.id === id(admin)
    && aud.executor?.id === id(financeiro) && aud.devolucao?.meio_original === 'dinheiro' && aud.devolucao?.meio_alternativo === false
    && aud.status_mensalidade?.depois === 'parcial' && aud.acesso_reavaliado?.liberado === false && aud.valor_estornado === 60, aud);
  const acoes = (await qa("SELECT action FROM audit_log WHERE record_type = 'pagamento_estorno' AND record_id = ? ORDER BY id", [String(e60.id)])).map((a) => a.action);
  check('auditoria das tres etapas', JSON.stringify(acoes) === JSON.stringify(['solicitar_estorno_pagamento', 'aprovar_estorno_pagamento', 'executar_estorno_pagamento']), acoes);

  // ===================================================================
  grupo('Repeticao');
  await semEfeito('executar de novo a mesma aprovacao', p60.id, () => executar(financeiro, e60.id, devolver('dinheiro', 60)), 409, 'ESTORNO_JA_EXECUTADO');
  await semEfeito('solicitar estorno de pagamento ja estornado', p60.id, () => solicitar(recepcao, p60.id), 409, 'PAGAMENTO_JA_ESTORNADO');

  // ===================================================================
  grupo('Autorizacao externa e devolucao em outro meio');
  const e40 = (await solicitar(recepcao, p40.id, 'Desistencia')).j;
  r = await externa(recepcao, e40.id, { autorizador_id: Number(id(owner)), canal: 'whatsapp', referencia: 'Grupo Equipe, 10:42', autorizado_em: agoraISO() });
  check('recepcao registra autorizacao do dono por WhatsApp -> 200', r.s === 200 && r.j?.status === 'aprovada' && r.j.aprovado_por === id(owner)
    && r.j.autorizacao_canal === 'whatsapp' && r.j.autorizacao_registrada_por === id(recepcao), `${r.s} ${r.code || ''} ${r.j?.error || ''}`);
  await semEfeito('devolucao em dinheiro sem comprovante', p40.id,
    () => executar(financeiro, e40.id, devolver('dinheiro', 40, { motivo_troca_meio: 'Aluno preferiu dinheiro' })), 422, 'COMPROVANTE_OBRIGATORIO');
  r = await executar(financeiro, e40.id, devolver('dinheiro', 40, { motivo_troca_meio: 'Aluno preferiu dinheiro', comprovante_referencia: 'Recibo 123' }));
  check('financeiro devolve R$ 40 em dinheiro (pago no Pix) com motivo e comprovante -> 200', r.s === 200 && r.j?.estorno?.devolucao_meio_alternativo === 1
    && r.j.estorno.devolucao_motivo === 'Aluno preferiu dinheiro' && r.j.estorno.devolucao_comprovante === 'Recibo 123', `${r.s} ${r.code || ''} ${r.j?.error || ''}`);
  check('sem pagamentos validos a mensalidade volta a em aberto', r.j?.status_mensalidade === 'em_aberto' && r.j.total_pago === 0 && r.j.saldo_em_aberto === 100, r.j?.status_mensalidade);
  aud = JSON.parse((await q1("SELECT metadata_json FROM audit_log WHERE action = 'executar_estorno_pagamento' AND record_id = ?", [String(e40.id)]))?.metadata_json || '{}');
  check('auditoria registra autorizacao declarada, registrante e meio alternativo', aud.autorizador?.declarada_pelo_operador === true
    && aud.registrado_por?.id === id(recepcao) && aud.devolucao?.meio_original === 'pix' && aud.devolucao?.meio_alternativo === true
    && aud.devolucao?.comprovante_referencia === 'Recibo 123', aud.devolucao);

  // ===================================================================
  grupo('Pagamento sem meio registrado');
  const m3 = await alunoPago([[100, null]]);
  check('pagamento sem forma informada fica sem meio', (await q1('SELECT forma_pagamento FROM pagamento WHERE id = ?', [m3.pags[0].id])).forma_pagamento === null);
  const e3 = (await solicitar(recepcao, m3.pags[0].id, 'Lancado no aluno errado')).j;
  await aprovar(owner, e3.id, matriz);
  r = await executar(financeiro, e3.id, {});
  check('executa sem devolucao por meio (nenhum meio atribuido) -> 200', r.s === 200 && r.j?.estorno?.devolucao_meio_alternativo === null, `${r.s} ${r.code || ''} ${r.j?.error || ''}`);
  check('nenhuma devolucao gravada', (await q1('SELECT COUNT(*) AS n FROM pagamento_devolucao WHERE pagamento_id = ?', [m3.pags[0].id])).n === 0);

  // ===================================================================
  grupo('Concorrencia');
  const m4 = await alunoPago([[100, 'pix']]);
  const e4 = (await solicitar(recepcao, m4.pags[0].id, 'Paralelo')).j;
  await aprovar(admin, e4.id);
  const lancAntes = (await q1("SELECT COUNT(*) AS n FROM conta_financeira WHERE origem = 'reversao_controlada'")).n;
  const tres = await Promise.all([financeiro, admin, owner].map((s) => executar(s, e4.id, devolver('pix', 100), matriz)));
  check('mesma aprovacao executada 3 vezes em paralelo -> 1 aceita, 2 ESTORNO_JA_EXECUTADO', tres.filter((x) => x.s === 200).length === 1
    && tres.filter((x) => x.code === 'ESTORNO_JA_EXECUTADO').length === 2, tres.map((x) => `${x.s} ${x.code || ''}`).join(' | '));
  check('uma contrapartida e uma devolucao', (await q1("SELECT COUNT(*) AS n FROM conta_financeira WHERE origem = 'reversao_controlada'")).n === lancAntes + 1
    && (await q1('SELECT COUNT(*) AS n FROM pagamento_devolucao WHERE pagamento_id = ?', [m4.pags[0].id])).n === 1);

  // ===================================================================
  grupo('Periodo fechado e reabertura');
  const m5 = await alunoPago([[100, 'dinheiro']]);
  const e5 = (await solicitar(recepcao, m5.pags[0].id, 'Antes do fechamento')).j;
  const [ano, mes] = hoje.split('-').map(Number);
  r = await req('POST', `/fechamento-mensal/${ano}/${mes}/fechar`, { s: owner, unit: matriz });
  check(`setup: ${mes}/${ano} fechado na Matriz`, r.s === 200, `${r.s} ${r.code || ''}`);
  r = await aprovar(admin, e5.id);
  check('aprovar com o mes fechado -> 200', r.s === 200, `${r.s} ${r.code || ''}`);
  await semEfeito('executar com o mes fechado', m5.pags[0].id, () => executar(financeiro, e5.id, devolver('dinheiro', 100)), 423, 'PERIODO_FECHADO');
  check('aprovacao preservada apos a recusa', (await q1('SELECT status FROM pagamento_estorno WHERE id = ?', [e5.id])).status === 'aprovada');
  r = await req('POST', `/fechamento-mensal/${ano}/${mes}/reabrir`, { s: owner, unit: matriz, body: { motivo: 'L04A: estorno pendente' } });
  check('owner reabre o mes', r.s === 200, `${r.s} ${r.code || ''}`);
  r = await executar(financeiro, e5.id, devolver('dinheiro', 100));
  check('nova tentativa apos reabertura -> 200', r.s === 200, `${r.s} ${r.code || ''}`);

  // ===================================================================
  grupo('Opcao da unidade: tres contas distintas');
  r = await req('PATCH', '/pagamentos/estornos/politica', { s: admin, unit: matriz, body: { contas_distintas: true } });
  check('admin tenta ligar a opcao -> 403', r.s === 403 && r.code === 'PERMISSAO_NEGADA', `${r.s} ${r.code}`);
  r = await req('PATCH', '/pagamentos/estornos/politica', { s: owner, unit: matriz, body: { contas_distintas: true } });
  check('dono liga a opcao -> 200', r.s === 200 && r.j?.contas_distintas === true, `${r.s} ${r.code || ''}`);
  const m6 = await alunoPago([[100, 'pix']]);
  const e6 = (await solicitar(financeiro, m6.pags[0].id, 'Tres contas')).j;
  await aprovar(admin, e6.id);
  await semEfeito('aprovador executa com a opcao ligada', m6.pags[0].id, () => executar(admin, e6.id, devolver('pix', 100)), 403, 'CONTAS_DISTINTAS_EXIGIDAS');
  await semEfeito('solicitante executa com a opcao ligada', m6.pags[0].id, () => executar(financeiro, e6.id, devolver('pix', 100)), 403, 'CONTAS_DISTINTAS_EXIGIDAS');
  r = await executar(owner, e6.id, devolver('pix', 100), matriz);
  check('terceira conta (dono) executa -> 200', r.s === 200 && r.j?.estorno?.contas_distintas_exigidas === 1, `${r.s} ${r.code || ''}`);
  r = await req('PATCH', '/pagamentos/estornos/politica', { s: owner, unit: matriz, body: { contas_distintas: false } });
  check('dono desliga a opcao -> 200', r.s === 200 && r.j?.contas_distintas === false);

  // ===================================================================
  grupo('Fila do Financeiro');
  r = await req('GET', `/pagamentos/estornos?aluno_id=${m1.aluno.id}`, { s: financeiro });
  check('fila mostra aluno, meio original, devolucao e estado', r.s === 200 && r.j.length === 2 && r.j.every((e) => e.aluno_nome && e.status === 'executada')
    && r.j.some((e) => e.devolucoes?.[0]?.meio === 'dinheiro' && e.meio_original === 'pix'), r.j?.map((e) => [e.meio_original, e.devolucoes?.map((d) => d.meio)]));
  r = await req('GET', '/pagamentos/estornos', { s: operador });
  check('operador de acesso nao ve a fila -> 403', r.s === 403, r.s);

  console.log('\nResumo por grupo:');
  let falhas = 0;
  for (const [nome, x] of Object.entries(resultados)) {
    falhas += x.falhas;
    console.log(`  ${nome}: ${x.ok}/${x.ok + x.falhas} OK`);
  }
  const total = Object.values(resultados).reduce((a, x) => a + x.ok + x.falhas, 0);
  console.log(`\n[smoke-l04-estorno-pagamento] ${total - falhas}/${total} verificacoes OK`);
  db.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('[ERRO]', e);
  db.close();
  process.exit(1);
});
