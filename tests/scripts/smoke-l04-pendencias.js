// Smoke L04 · Pendencias por estorno, cobertura proporcional do pacote e
// contato com o aluno (sublote B; decisoes de 20/11 e 26/11/2026).
//
// Base DESCARTAVEL criada com `npm run db:seed:dev` e a API rodando sobre ela.
// O smoke cria alunos "L04B ..." na Matriz com mensalidades do Plano Trimestral
// (pacote de 3 meses iniciado ha 45 dias) e do Plano Basico, estorna
// pagamentos pelo fluxo do sublote A e le o SQLite somente para conferir os
// efeitos.
//
// Uso:
//   node tests/scripts/smoke-l04-pendencias.js --base-url=http://localhost:3001 --db=backend/academia.sqlite
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
  return { s: r.status, j, code: j?.code || null, t };
}
async function login(l) {
  const r = await req('POST', '/auth/login', { body: { login: l, senha: PW } });
  if (r.s !== 200) throw new Error(`login ${l}: ${r.s} ${r.code}`);
  return { token: r.j.data.token, user: r.j.data.usuario, login: l };
}
const dado = (r) => r.j?.data || r.j;

function somaDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
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
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const inicioPacote = somaDias(hoje, -45);
  const planos = dado(await req('GET', '/planos', { s: owner, unit: matriz }));
  const lista = Array.isArray(planos) ? planos : [];
  const trimestral = lista.find((p) => Number(p.duracao_em_dias) === 90);
  const mensal = lista.find((p) => Number(p.duracao_em_dias) === 30 && !Number(p.compartilhado));
  check('setup: planos trimestral (90 dias) e mensal disponiveis', Boolean(trimestral && mensal), [trimestral?.id, mensal?.id]);

  let seq = 0;
  async function aluno(nome, extra = {}) {
    seq += 1;
    const r = await req('POST', '/alunos', { s: owner, unit: matriz, body: { nome: `L04B ${nome} ${seq} ${RUN}`, data_nascimento: '1990-01-01', plano_id: (extra.plano || mensal).id, dia_vencimento: 10, status: 'ativo', telefone: '(85) 99999-0000', ...extra.body } });
    if (r.s !== 201) throw new Error(`aluno: ${r.s} ${r.code} ${r.t}`);
    return dado(r);
  }
  async function mensalidadeCom(a, plano, valor, inicio, pagamentos) {
    const r = await req('POST', '/mensalidades', { s: owner, unit: matriz, body: { aluno_id: a.id, plano_id: plano.id, vencimento: hoje, ...(inicio ? { data_inicio: inicio } : {}), valor_cobrado: valor } });
    if (r.s !== 201) throw new Error(`mensalidade: ${r.s} ${r.code} ${r.t}`);
    const m = dado(r);
    const pags = [];
    for (const v of pagamentos) {
      const p = await req('POST', '/pagamentos', { s: recepcao, unit: matriz, body: { mensalidade_id: m.id, valor_pago: v, forma_pagamento: 'pix' } });
      if (p.s !== 201) throw new Error(`pagamento: ${p.s} ${p.code}`);
      pags.push(p.j.pagamento || p.j);
    }
    return { m, pags };
  }
  async function estornar(pagamento) {
    const valor = Number(pagamento.valor_pago);
    const s = await req('POST', `/pagamentos/${pagamento.id}/estornos`, { s: recepcao, unit: matriz, body: { motivo: 'Smoke L04B' } });
    const a = await req('POST', `/pagamentos/estornos/${s.j.id}/aprovar`, { s: admin, unit: matriz });
    const e = await req('POST', `/pagamentos/estornos/${s.j.id}/executar`, { s: financeiro, unit: matriz, body: { devolucoes: [{ meio: 'pix', valor }], devolucao_confirmada: true } });
    if (s.s !== 201 || a.s !== 200 || e.s !== 200) throw new Error(`estorno: ${s.s}/${a.s}/${e.s} ${e.code} ${e.t}`);
    return e.j;
  }
  const acesso = async (a) => (await req('POST', '/acessos/mock-hikvision', { s: recepcao, unit: matriz, body: { aluno_id: a.id } })).j?.avaliacao;
  const pendencias = async (s = recepcao, query = '') => req('GET', `/pendencias${query}`, { s, unit: matriz });
  const pendenciaDe = async (m) => (await pendencias()).j.find((p) => p.mensalidade_id === m.id);

  // ===================================================================
  grupo('E-mail opcional do aluno');
  {
    const a = await aluno('Email', { body: { email: '  Ana.Silva@Exemplo.COM ' } });
    check('cadastro grava o e-mail normalizado', a.email === 'ana.silva@exemplo.com', a.email);
    const semEmail = await aluno('SemEmail');
    check('cadastro sem e-mail continua rapido (e-mail nulo)', semEmail.email === null, semEmail.email);
    const antes = await q1('SELECT COUNT(*) AS n FROM aluno');
    const r = await req('POST', '/alunos', { s: recepcao, unit: matriz, body: { nome: `L04B Invalido ${RUN}`, data_nascimento: '1990-01-01', plano_id: mensal.id, dia_vencimento: 10, email: 'sem-arroba' } });
    const depois = await q1('SELECT COUNT(*) AS n FROM aluno');
    check('e-mail invalido -> 400 ALUNO_EMAIL_INVALIDO sem gravar', r.s === 400 && r.code === 'ALUNO_EMAIL_INVALIDO' && antes.n === depois.n, `${r.s} ${r.code}`);
    const base = { nome: a.nome, data_nascimento: '1990-01-01', plano_id: mensal.id, dia_vencimento: 10, status: 'ativo', telefone: a.telefone };
    await req('PUT', `/alunos/${a.id}`, { s: owner, unit: matriz, body: base });
    check('edicao sem o campo mantem o e-mail', (await q1('SELECT email FROM aluno WHERE id = ?', [a.id])).email === 'ana.silva@exemplo.com');
    await req('PUT', `/alunos/${a.id}`, { s: owner, unit: matriz, body: { ...base, email: '' } });
    check('edicao com e-mail vazio limpa o campo', (await q1('SELECT email FROM aluno WHERE id = ?', [a.id])).email === null);
    const inv = await req('PUT', `/alunos/${a.id}`, { s: owner, unit: matriz, body: { ...base, email: 'a@b' } });
    check('edicao com e-mail invalido -> 400', inv.s === 400 && inv.code === 'ALUNO_EMAIL_INVALIDO', `${inv.s} ${inv.code}`);
  }

  // ===================================================================
  grupo('Pacote: cobertura proporcional ainda vigente');
  const aLib = await aluno('PacoteLiberado', { plano: trimestral, body: { email: 'pacote@exemplo.com' } });
  const pLib = await mensalidadeCom(aLib, trimestral, 300, inicioPacote, [100, 200]);
  {
    const meses = await q1('SELECT data_inicio, data_fim FROM mensalidade WHERE id = ?', [pLib.m.id]);
    check('pacote de 3 meses iniciado ha 45 dias', meses.data_inicio === inicioPacote, meses);
    const antes = await acesso(aLib);
    check('pacote quitado: acesso liberado sem restricao', antes?.ok && antes.status === 'liberado', antes?.status);
    const ex = await estornar(pLib.pags[0]); // estorna R$ 100; restam R$ 200 = 2 meses
    check('execucao reavalia o acesso: liberado', ex.acesso?.liberado === true, ex.acesso);
    const av = await acesso(aLib);
    check('acesso liberado com restricao (cobertura_proporcional)', av?.ok && av.status === 'liberado_com_restricao' && av.motivo === 'cobertura_proporcional', av && `${av.status} ${av.motivo}`);
    check('aviso traz 2 de 3 meses e saldo de R$ 100', av?.pendencia?.meses_cobertos === 2 && av.pendencia.meses === 3 && av.pendencia.saldo_em_aberto === 100, av?.pendencia);
    const p = await pendenciaDe(pLib.m);
    check('pendencia listada: pacote, liberado ate o fim do 2o mes', p?.tipo === 'pacote' && p.acesso === 'liberado_ate' && p.liberado_ate === av?.pendencia?.cobertura_ate && p.liberado_ate >= hoje, p && { acesso: p.acesso, ate: p.liberado_ate });
    check('pendencia traz contato do aluno (telefone e e-mail)', p?.telefone && p.email === 'pacote@exemplo.com', p && [p.telefone, p.email]);
  }

  // ===================================================================
  grupo('Pacote: cobertura proporcional encerrada');
  const aEnc = await aluno('PacoteEncerrado', { plano: trimestral });
  const pEnc = await mensalidadeCom(aEnc, trimestral, 300, inicioPacote, [100, 200]);
  {
    await estornar(pEnc.pags[1]); // estorna R$ 200; resta R$ 100 = 1 mes, ja terminado
    const av = await acesso(aEnc);
    check('acesso bloqueado (cobertura_proporcional_encerrada)', av && !av.ok && av.motivo === 'cobertura_proporcional_encerrada', av && `${av.status} ${av.motivo}`);
    check('a cobertura de 1 mes terminou antes de hoje', av?.pendencia?.meses_cobertos === 1 && av.pendencia.cobertura_ate < hoje, av?.pendencia);
    const p = await pendenciaDe(pEnc.m);
    check('pendencia listada como bloqueada', p?.acesso === 'bloqueado' && p.liberado_ate === null && p.saldo_em_aberto === 200, p && [p.acesso, p.saldo_em_aberto]);
  }

  // ===================================================================
  grupo('Pacote: valor pago nao cobre nenhum mes');
  const aZero = await aluno('PacoteZero', { plano: trimestral });
  const pZero = await mensalidadeCom(aZero, trimestral, 300, inicioPacote, [50, 250]);
  {
    await estornar(pZero.pags[1]); // resta R$ 50 < 1 mes
    const av = await acesso(aZero);
    check('acesso bloqueado na hora', av && !av.ok && av.motivo === 'cobertura_proporcional_encerrada' && av.pendencia?.meses_cobertos === 0 && av.pendencia.cobertura_ate === null, av && { motivo: av.motivo, p: av.pendencia });
  }

  // ===================================================================
  grupo('Mensal: estorno parcial bloqueia na hora');
  const aMes = await aluno('Mensal');
  const pMes = await mensalidadeCom(aMes, mensal, 100, null, [50, 50]);
  {
    const antes = await acesso(aMes);
    check('mensal quitada: liberado', antes?.ok === true, antes?.status);
    const ex = await estornar(pMes.pags[0]);
    check('execucao reavalia: bloqueado', ex.acesso?.liberado === false, ex.acesso);
    const av = await acesso(aMes);
    check('motivo sem_cobertura_paga_vigente, sem cobertura proporcional', av && !av.ok && av.motivo === 'sem_cobertura_paga_vigente' && !av.pendencia, av && av.motivo);
    const p = await pendenciaDe(pMes.m);
    check('pendencia mensal bloqueada com saldo de R$ 50', p?.tipo === 'mensal' && p.acesso === 'bloqueado' && p.saldo_em_aberto === 50, p && [p.tipo, p.acesso, p.saldo_em_aberto]);
  }

  // ===================================================================
  grupo('Ordem e resumo');
  {
    const r = await pendencias();
    const minhas = r.j.filter((p) => [pLib.m.id, pEnc.m.id, pZero.m.id, pMes.m.id].includes(p.mensalidade_id));
    check('quatro pendencias do smoke na lista', minhas.length === 4, minhas.length);
    const primeiraLiberada = r.j.findIndex((p) => p.acesso === 'liberado_ate');
    const ultimaBloqueada = r.j.map((p) => p.acesso).lastIndexOf('bloqueado');
    check('bloqueadas antes das liberadas', primeiraLiberada === -1 || ultimaBloqueada < primeiraLiberada, [ultimaBloqueada, primeiraLiberada]);
    const res = await req('GET', '/pendencias/resumo', { s: recepcao, unit: matriz });
    check('resumo conta total, bloqueadas e sem contato', res.s === 200 && res.j.total === r.j.length && res.j.bloqueados === r.j.filter((p) => p.acesso === 'bloqueado').length && res.j.sem_contato >= 4, res.j);
    const filtro = await pendencias(recepcao, `?aluno_id=${aEnc.id}`);
    check('filtro por aluno', filtro.s === 200 && filtro.j.length === 1 && filtro.j[0].mensalidade_id === pEnc.m.id, filtro.j?.length);
  }

  // ===================================================================
  grupo('Permissoes e escopo');
  {
    for (const [s, esperado] of [[recepcao, 200], [gestor, 200], [financeiro, 200], [admin, 200], [owner, 200], [operador, 403]]) {
      const r = await pendencias(s);
      check(`GET /pendencias como ${s.login} -> ${esperado}`, r.s === esperado, `${r.s} ${r.code || ''}`);
    }
    const filialLista = await req('GET', '/pendencias', { s: owner, unit: filial });
    check('Filial nao ve pendencias da Matriz', filialLista.s === 200 && !filialLista.j.some((p) => p.aluno_id === aLib.id), filialLista.j?.length);
    const semToken = await req('GET', '/pendencias', { unit: matriz });
    check('sem sessao -> 401', semToken.s === 401, semToken.s);
  }

  // ===================================================================
  grupo('Contatar aluno');
  {
    const contar = async () => (await q1('SELECT COUNT(*) AS n FROM aluno_contato')).n;
    const audit = async () => (await q1("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'registrar_contato_aluno'")).n;
    const [c0, a0] = [await contar(), await audit()];
    const r = await req('POST', '/pendencias/contatos', { s: recepcao, unit: matriz, body: { aluno_id: aEnc.id, mensalidade_id: pEnc.m.id, canal: 'whatsapp', observacao: 'Vai pagar na sexta' } });
    check('recepcao registra contato por WhatsApp -> 201', r.s === 201 && r.j.canal === 'whatsapp' && r.j.registrado_por === String(recepcao.user.id), `${r.s} ${r.code || ''}`);
    check('contato gravado e auditado', (await contar()) === c0 + 1 && (await audit()) === a0 + 1);
    const p = await pendenciaDe(pEnc.m);
    check('pendencia mostra o ultimo contato e segue aberta', p?.ultimo_contato?.canal === 'whatsapp' && p.ultimo_contato.observacao === 'Vai pagar na sexta' && p.acesso === 'bloqueado', p?.ultimo_contato);
    const lista = await req('GET', `/pendencias/contatos?aluno_id=${aEnc.id}`, { s: gestor, unit: matriz });
    check('historico de contatos do aluno', lista.s === 200 && lista.j.length === 1 && lista.j[0].id === r.j.id, lista.j?.length);

    const recusas = [
      ['e-mail sem e-mail cadastrado -> 422 CONTATO_SEM_EMAIL', recepcao, matriz, { aluno_id: aEnc.id, canal: 'email' }, 422, 'CONTATO_SEM_EMAIL'],
      ['canal invalido -> 400 CONTATO_CANAL_INVALIDO', recepcao, matriz, { aluno_id: aEnc.id, canal: 'sms' }, 400, 'CONTATO_CANAL_INVALIDO'],
      ['mensalidade de outro aluno -> 404', recepcao, matriz, { aluno_id: aEnc.id, mensalidade_id: pLib.m.id, canal: 'presencial' }, 404, 'MENSALIDADE_NAO_ENCONTRADA'],
      ['aluno da Matriz pela Filial -> 404', owner, filial, { aluno_id: aEnc.id, canal: 'presencial' }, 404, 'ALUNO_NAO_ENCONTRADO'],
      ['operador de acesso -> 403', operador, matriz, { aluno_id: aEnc.id, canal: 'presencial' }, 403, null],
    ];
    for (const [label, s, unit, body, status, code] of recusas) {
      const antes = await contar();
      const x = await req('POST', '/pendencias/contatos', { s, unit, body });
      check(`${label} sem gravar`, x.s === status && (!code || x.code === code) && (await contar()) === antes, `${x.s} ${x.code || ''}`);
    }
    const email = await req('POST', '/pendencias/contatos', { s: financeiro, unit: matriz, body: { aluno_id: aLib.id, canal: 'email' } });
    check('financeiro registra contato por e-mail de aluno com e-mail', email.s === 201, `${email.s} ${email.code || ''}`);
  }

  // ===================================================================
  grupo('Quitacao encerra a pendencia');
  {
    const r = await req('POST', '/pagamentos', { s: recepcao, unit: matriz, body: { mensalidade_id: pLib.m.id, valor_pago: 100, forma_pagamento: 'dinheiro' } });
    check('novo pagamento de R$ 100 quita o pacote', r.s === 201, `${r.s} ${r.code || ''}`);
    check('mensalidade volta a paga', (await q1('SELECT status FROM mensalidade WHERE id = ?', [pLib.m.id])).status === 'pago');
    check('pendencia sai da lista', !(await pendenciaDe(pLib.m)));
    const av = await acesso(aLib);
    check('acesso volta a liberado sem restricao', av?.ok && av.status === 'liberado' && !av.pendencia, av?.status);
    const contatos = await req('GET', `/pendencias/contatos?aluno_id=${aLib.id}`, { s: recepcao, unit: matriz });
    check('historico de contato preservado', contatos.j?.length === 1, contatos.j?.length);
  }

  // ===================================================================
  let ok = 0; let falhas = 0;
  console.log('\nResumo por grupo:');
  for (const [nome, r] of Object.entries(resultados)) {
    ok += r.ok; falhas += r.falhas;
    console.log(`  ${nome}: ${r.ok}/${r.ok + r.falhas}`);
  }
  db.close();
  console.log(`[smoke-l04-pendencias] ${ok}/${ok + falhas} verificacoes OK`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('[smoke-l04-pendencias] erro', e);
  process.exit(1);
});
