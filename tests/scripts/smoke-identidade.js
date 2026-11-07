// Smoke de Identidade e Acesso (GS-03).
//
// Pre-requisitos: backend rodando sobre uma base criada com `npm run db:seed:dev`.
// NUNCA rode contra base real: o smoke cria uma Rede B, usuarios SMOKE_* e
// altera unidades/papeis desses usuarios de teste.
//
// Uso:
//   node tests/scripts/smoke-identidade.js [--base-url=http://localhost:3001]
// Variaveis: SEED_DEV_PASSWORD (padrao dev12345), SMOKE_PLATFORM_LOGIN (admin),
//            SMOKE_PLATFORM_PASSWORD (BOOTSTRAP_ADMIN_PASSWORD ou admin123).
//
// Cobre: Matriz -> Filial, Filial -> Matriz, Rede A -> Rede B, hierarquia de
// papeis, bloqueio de promocao a platform_admin, unidades obrigatorias, revogacao
// de sessao ao mudar unidades, auditoria e repeticao apos refresh de sessao.
// Para cobrir reinicio, rode duas vezes reiniciando a API entre as execucoes.

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const BASE = (args['base-url'] || process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const PW = process.env.SEED_DEV_PASSWORD || 'dev12345';
const PLATFORM_LOGIN = process.env.SMOKE_PLATFORM_LOGIN || 'admin';
const PLATFORM_PW = process.env.SMOKE_PLATFORM_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin123';
const RUN = Date.now().toString(36);
const REDE_B_DOC = 'smoke-identidade-rede-b';
const REDE_B_OWNER = 'smoke.owner.redeb';

let falhas = 0;
let total = 0;
function check(label, cond, extra = '') {
  total += 1;
  if (!cond) falhas += 1;
  console.log(`${cond ? '[OK]     ' : '[FALHOU] '}${label}${extra ? ` - ${extra}` : ''}`);
}

async function req(method, path, { token, unit, body, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (unit) headers['X-Unit-Id'] = String(unit);
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  const setCookie = response.headers.get('set-cookie') || '';
  return { status: response.status, json, code: json?.code || null, cookie: setCookie.split(';')[0] };
}

async function login(loginName, senha = PW) {
  const r = await req('POST', '/auth/login', { body: { login: loginName, senha } });
  if (r.status !== 200) throw new Error(`login ${loginName} falhou: ${r.status} ${r.code}`);
  return { token: r.json.data.token, cookie: r.cookie, user: r.json.data.usuario };
}

async function refresh(session) {
  const r = await req('POST', '/auth/refresh', { cookie: session.cookie });
  if (r.status !== 200) throw new Error(`refresh falhou: ${r.status} ${r.code}`);
  return { token: r.json.data.token, cookie: r.cookie || session.cookie, user: r.json.data.usuario, oldToken: session.token };
}

const ids = (units) => (units || []).map((u) => Number(u.id)).sort((a, b) => a - b);
const listLogins = (r) => (r.json?.data || []).map((u) => u.login);

async function prepararRedeB(platform) {
  const tenants = await req('GET', '/tenants', { token: platform.token });
  let redeB = (tenants.json?.data || []).find((t) => t.documento === REDE_B_DOC);
  if (!redeB) {
    const r = await req('POST', '/onboarding/tenants', {
      token: platform.token,
      body: {
        tenant_nome: 'Rede B (smoke)', tenant_documento: REDE_B_DOC, tenant_status: 'ativo',
        unit_nome: 'Matriz Rede B', unit_codigo: 'matriz',
        admin_nome: 'Owner Rede B (smoke)', admin_login: REDE_B_OWNER, admin_senha: PW,
      },
    });
    check('setup: onboarding cria Rede B', r.status === 201, `${r.status} ${r.code || ''}`);
    redeB = r.json?.data?.tenant;
  }
  return redeB;
}

async function verificarIsolamento(fase, s) {
  const { matrizId, filialId, redeBUnitId } = s.ids;

  // Matriz -> Filial
  check(`${fase} recepcao (Matriz) so tem a Matriz`, JSON.stringify(ids(s.recepcao.user.allowedUnits)) === JSON.stringify([matrizId]),
    JSON.stringify(ids(s.recepcao.user.allowedUnits)));
  let r = await req('GET', '/alunos', { token: s.recepcao.token, unit: filialId });
  check(`${fase} Matriz -> Filial: recepcao com X-Unit-Id da Filial -> 403 UNIT_FORBIDDEN`, r.status === 403 && r.code === 'UNIT_FORBIDDEN', `${r.status} ${r.code}`);

  // Filial -> Matriz
  check(`${fase} recepcao.filial so tem a Filial (sem vinculo automatico com a Matriz)`, JSON.stringify(ids(s.recepcaoFilial.user.allowedUnits)) === JSON.stringify([filialId]),
    JSON.stringify(ids(s.recepcaoFilial.user.allowedUnits)));
  r = await req('GET', '/alunos', { token: s.recepcaoFilial.token, unit: matrizId });
  check(`${fase} Filial -> Matriz: recepcao.filial com X-Unit-Id da Matriz -> 403 UNIT_FORBIDDEN`, r.status === 403 && r.code === 'UNIT_FORBIDDEN', `${r.status} ${r.code}`);
  r = await req('GET', '/units/me', { token: s.recepcaoFilial.token });
  check(`${fase} recepcao.filial sem header opera na Filial`, Number(r.json?.data?.currentUnit?.id) === filialId, JSON.stringify(r.json?.data?.currentUnit?.id));

  // Rede A -> Rede B
  r = await req('GET', '/alunos', { token: s.ownerA.token, unit: redeBUnitId });
  check(`${fase} Rede A -> Rede B: owner A com X-Unit-Id da Rede B -> 403`, r.status === 403, `${r.status} ${r.code}`);
  r = await req('GET', '/alunos', { token: s.ownerB.token, unit: matrizId });
  check(`${fase} Rede B -> Rede A: owner B com X-Unit-Id da Matriz A -> 403`, r.status === 403, `${r.status} ${r.code}`);
  check(`${fase} owner B so tem a unidade da Rede B`, JSON.stringify(ids(s.ownerB.user.allowedUnits)) === JSON.stringify([redeBUnitId]));
  r = await req('GET', '/usuarios-internos', { token: s.ownerA.token });
  check(`${fase} listagem da Rede A nao mostra usuarios da Rede B nem contas de plataforma`,
    r.status === 200 && !listLogins(r).includes(REDE_B_OWNER) && !listLogins(r).includes(PLATFORM_LOGIN) && listLogins(r).includes('recepcao.filial'));
  r = await req('GET', '/usuarios-internos', { token: s.ownerB.token });
  check(`${fase} listagem da Rede B nao mostra usuarios da Rede A`, r.status === 200 && !listLogins(r).includes('recepcao') && !listLogins(r).includes('owner'),
    JSON.stringify(listLogins(r)));
  r = await req('GET', `/usuarios-internos?tenant_id=${s.redeB.id}`, { token: s.ownerA.token });
  check(`${fase} owner A pedindo tenant_id da Rede B -> 403 TENANT_FORA_DO_ESCOPO`, r.status === 403 && r.code === 'TENANT_FORA_DO_ESCOPO', `${r.status} ${r.code}`);
  r = await req('PATCH', `/usuarios-internos/${s.ownerB.user.id}/status`, { token: s.ownerA.token, body: { status: 'inativo' } });
  check(`${fase} owner A alterando usuario da Rede B -> 404`, r.status === 404, `${r.status} ${r.code}`);
  r = await req('PATCH', `/usuarios-internos/${s.recepcao.user.id}/unidades`, { token: s.ownerA.token, body: { unit_ids: [matrizId, redeBUnitId] } });
  check(`${fase} owner A dando unidade da Rede B -> 403 UNIDADE_FORA_DO_ESCOPO`, r.status === 403 && r.code === 'UNIDADE_FORA_DO_ESCOPO', `${r.status} ${r.code}`);
  r = await req('POST', '/usuarios-internos', { token: s.ownerB.token, body: { nome: 'X', login: `smoke.x.${RUN}`, senha: PW, papel: 'recepcao', unit_ids: [matrizId] } });
  check(`${fase} owner B criando usuario em unidade da Rede A -> 403`, r.status === 403 && r.code === 'UNIDADE_FORA_DO_ESCOPO', `${r.status} ${r.code}`);

  // Promocao a platform_admin
  r = await req('PATCH', `/usuarios-internos/${s.adminAcademia.user.id}/papel`, { token: s.adminAcademia.token, body: { papel: 'platform_admin' } });
  check(`${fase} admin promovendo a si mesmo a platform_admin -> 403`, r.status === 403, `${r.status} ${r.code}`);
  r = await req('PATCH', `/usuarios-internos/${s.recepcao.user.id}/papel`, { token: s.adminAcademia.token, body: { papel: 'platform_admin' } });
  check(`${fase} admin promovendo outro usuario a platform_admin -> 403 PLATFORM_ADMIN_RESTRITO`, r.status === 403 && r.code === 'PLATFORM_ADMIN_RESTRITO', `${r.status} ${r.code}`);
  r = await req('PATCH', `/usuarios-internos/${s.recepcao.user.id}/papel`, { token: s.ownerA.token, body: { papel: 'platform_admin' } });
  check(`${fase} owner promovendo usuario a platform_admin -> 403 PLATFORM_ADMIN_RESTRITO`, r.status === 403 && r.code === 'PLATFORM_ADMIN_RESTRITO', `${r.status} ${r.code}`);
  r = await req('POST', '/usuarios-internos', { token: s.adminAcademia.token, body: { nome: 'P', login: `smoke.p.${RUN}`, senha: PW, papel: 'platform_admin', unit_ids: [matrizId] } });
  check(`${fase} admin criando usuario platform_admin -> 403 PLATFORM_ADMIN_RESTRITO`, r.status === 403 && r.code === 'PLATFORM_ADMIN_RESTRITO', `${r.status} ${r.code}`);
  r = await req('PATCH', `/usuarios-internos/${s.platform.user.id}/status`, { token: s.adminAcademia.token, body: { status: 'inativo' } });
  check(`${fase} admin inativando conta de plataforma -> 403`, r.status === 403 && r.code === 'PLATFORM_ADMIN_RESTRITO', `${r.status} ${r.code}`);
  const me = await req('GET', '/auth/me', { token: s.adminAcademia.token });
  check(`${fase} admin.academia continua admin`, me.json?.data?.papel === 'admin' || me.json?.data?.usuario?.papel === 'admin', JSON.stringify(me.json?.data?.papel || me.json?.data?.usuario?.papel));
}

async function main() {
  console.log(`[smoke-identidade] ${BASE} run=${RUN}`);
  const platform = await login(PLATFORM_LOGIN, PLATFORM_PW);
  const redeB = await prepararRedeB(platform);
  const s = {
    platform,
    redeB,
    ownerA: await login('owner'),
    adminAcademia: await login('admin.academia'),
    recepcao: await login('recepcao'),
    recepcaoFilial: await login('recepcao.filial'),
    ownerB: await login(REDE_B_OWNER),
  };
  const unitsA = ids(s.ownerA.user.allowedUnits);
  s.ids = { matrizId: unitsA[0], filialId: unitsA[1], redeBUnitId: ids(s.ownerB.user.allowedUnits)[0] };
  check('setup: owner A tem Matriz e Filial', unitsA.length === 2, JSON.stringify(unitsA));

  await verificarIsolamento('[sessao]', s);

  // Gestao com escopo e hierarquia (admin.academia so tem a Matriz)
  const { matrizId, filialId } = s.ids;
  let r = await req('GET', '/usuarios-internos', { token: s.adminAcademia.token });
  check('admin (Matriz) nao lista usuario so da Filial', r.status === 200 && !listLogins(r).includes('recepcao.filial') && listLogins(r).includes('recepcao'));
  const ownerRow = (r.json?.data || []).find((u) => u.login === 'owner');
  check('admin ve owner como nao gerenciavel', ownerRow && ownerRow.gerenciavel === false && ownerRow.motivo_bloqueio === 'HIERARQUIA_INSUFICIENTE', JSON.stringify(ownerRow?.motivo_bloqueio));
  r = await req('GET', '/usuarios-internos/opcoes', { token: s.adminAcademia.token });
  check('opcoes do admin: sem owner/platform_admin e so a Matriz',
    r.status === 200 && !r.json.data.papeis_atribuiveis.includes('owner') && !r.json.data.papeis_atribuiveis.includes('platform_admin')
    && JSON.stringify(ids(r.json.data.unidades)) === JSON.stringify([matrizId]));
  r = await req('PATCH', `/usuarios-internos/${s.recepcaoFilial.user.id}/status`, { token: s.adminAcademia.token, body: { status: 'inativo' } });
  check('admin (Matriz) alterando usuario da Filial -> 403 USUARIO_FORA_DAS_UNIDADES_GERENCIAVEIS', r.status === 403 && r.code === 'USUARIO_FORA_DAS_UNIDADES_GERENCIAVEIS', `${r.status} ${r.code}`);
  r = await req('PATCH', `/usuarios-internos/${s.ownerA.user.id}/papel`, { token: s.adminAcademia.token, body: { papel: 'recepcao' } });
  check('admin rebaixando owner -> 403', r.status === 403, `${r.status} ${r.code}`);
  r = await req('POST', '/usuarios-internos', { token: s.adminAcademia.token, body: { nome: 'O', login: `smoke.o.${RUN}`, senha: PW, papel: 'owner', unit_ids: [matrizId] } });
  check('admin criando owner -> 403 HIERARQUIA_INSUFICIENTE', r.status === 403 && r.code === 'HIERARQUIA_INSUFICIENTE', `${r.status} ${r.code}`);
  r = await req('POST', '/usuarios-internos', { token: s.adminAcademia.token, body: { nome: 'F', login: `smoke.f.${RUN}`, senha: PW, papel: 'recepcao', unit_ids: [filialId] } });
  check('admin (Matriz) criando usuario na Filial -> 403 UNIDADE_FORA_DO_ESCOPO', r.status === 403 && r.code === 'UNIDADE_FORA_DO_ESCOPO', `${r.status} ${r.code}`);
  r = await req('POST', '/usuarios-internos', { token: s.adminAcademia.token, body: { nome: 'Sem unidade', login: `smoke.su.${RUN}`, senha: PW, papel: 'recepcao', unit_ids: [] } });
  check('criacao sem unidade -> 400 USUARIO_UNIDADE_OBRIGATORIA', r.status === 400 && r.code === 'USUARIO_UNIDADE_OBRIGATORIA', `${r.status} ${r.code}`);
  r = await req('PATCH', `/usuarios-internos/${s.ownerA.user.id}/unidades`, { token: s.ownerA.token, body: { unit_ids: [matrizId] } });
  check('owner alterando as proprias unidades -> 403 USUARIO_AUTOGESTAO_BLOQUEADA', r.status === 403 && r.code === 'USUARIO_AUTOGESTAO_BLOQUEADA', `${r.status} ${r.code}`);

  const novoLogin = `smoke.recepcao.${RUN}`;
  r = await req('POST', '/usuarios-internos', { token: s.adminAcademia.token, body: { nome: `SMOKE Recepcao ${RUN}`, login: novoLogin, senha: PW, papel: 'recepcao', unit_ids: [matrizId] } });
  check('admin cria usuario de recepcao na Matriz -> 201', r.status === 201 && JSON.stringify(r.json?.data?.unit_ids) === JSON.stringify([matrizId]), `${r.status} ${r.code || ''}`);
  const novoId = r.json?.data?.id;
  r = await req('POST', '/usuarios-internos', { token: s.adminAcademia.token, body: { nome: 'Dup', login: novoLogin, senha: PW, papel: 'recepcao', unit_ids: [matrizId] } });
  check('login duplicado -> 409', r.status === 409 && r.code === 'USUARIO_LOGIN_DUPLICADO', `${r.status} ${r.code}`);

  let novo = await login(novoLogin);
  check('novo usuario entra so com a Matriz', JSON.stringify(ids(novo.user.allowedUnits)) === JSON.stringify([matrizId]));
  r = await req('PATCH', `/usuarios-internos/${novoId}/unidades`, { token: s.ownerA.token, body: { unit_ids: [matrizId, filialId], unit_padrao_id: filialId } });
  check('owner autoriza Matriz + Filial (padrao Filial) -> 200', r.status === 200 && JSON.stringify(r.json?.data?.unit_ids) === JSON.stringify([matrizId, filialId]), `${r.status} ${r.code || ''}`);
  r = await req('GET', '/auth/me', { token: novo.token });
  check('mudanca de unidades revoga a sessao do usuario afetado -> 401', r.status === 401, `${r.status} ${r.code}`);
  r = await req('POST', '/auth/refresh', { cookie: novo.cookie });
  check('refresh da sessao revogada -> 401', r.status === 401, `${r.status} ${r.code}`);
  novo = await login(novoLogin);
  check('novo login traz Matriz + Filial com padrao Filial',
    JSON.stringify(ids(novo.user.allowedUnits)) === JSON.stringify([matrizId, filialId]) && Number(novo.user.currentUnit?.id) === filialId);
  r = await req('PATCH', `/usuarios-internos/${novoId}/unidades`, { token: s.ownerA.token, body: { unit_ids: [filialId] } });
  check('owner remove a Matriz -> 200', r.status === 200, `${r.status} ${r.code || ''}`);
  novo = await login(novoLogin);
  r = await req('GET', '/alunos', { token: novo.token, unit: matrizId });
  check('apos remocao, Matriz -> 403 UNIT_FORBIDDEN', r.status === 403 && r.code === 'UNIT_FORBIDDEN', `${r.status} ${r.code}`);
  r = await req('PATCH', `/usuarios-internos/${novoId}/papel`, { token: s.adminAcademia.token, body: { papel: 'gestor' } });
  check('admin (Matriz) nao altera usuario que agora e so da Filial -> 403', r.status === 403 && r.code === 'USUARIO_FORA_DAS_UNIDADES_GERENCIAVEIS', `${r.status} ${r.code}`);
  r = await req('PATCH', `/usuarios-internos/${novoId}/papel`, { token: s.ownerA.token, body: { papel: 'gestor' } });
  check('owner altera papel para gestor -> 200', r.status === 200 && r.json?.data?.papel === 'gestor', `${r.status} ${r.code || ''}`);

  r = await req('GET', `/audit-logs?module=usuarios_internos&limite=100`, { token: s.ownerA.token });
  const auditText = JSON.stringify(r.json || {});
  check('auditoria registra criacao, unidades e papel',
    r.status === 200 && ['criar_usuario_interno', 'alterar_unidades_usuario', 'alterar_papel_usuario'].every((a) => auditText.includes(a)), `${r.status}`);

  // Rede inativa: usuario sem unidade valida nao entra
  const tenantPayload = { nome: s.redeB.nome, documento: REDE_B_DOC, status: 'inativo' };
  r = await req('PATCH', `/tenants/${s.redeB.id}`, { token: platform.token, body: tenantPayload });
  check('setup: plataforma inativa a Rede B', r.status === 200, `${r.status} ${r.code || ''}`);
  r = await req('POST', '/auth/login', { body: { login: REDE_B_OWNER, senha: PW } });
  check('Rede inativa: login do owner B -> 403 USUARIO_SEM_UNIDADE_AUTORIZADA', r.status === 403 && r.code === 'USUARIO_SEM_UNIDADE_AUTORIZADA', `${r.status} ${r.code}`);
  r = await req('POST', '/auth/refresh', { cookie: s.ownerB.cookie });
  check('Rede inativa: refresh do owner B -> 403 USUARIO_SEM_UNIDADE_AUTORIZADA', r.status === 403 && r.code === 'USUARIO_SEM_UNIDADE_AUTORIZADA', `${r.status} ${r.code}`);
  r = await req('PATCH', `/tenants/${s.redeB.id}`, { token: platform.token, body: { ...tenantPayload, status: 'ativo' } });
  check('setup: plataforma reativa a Rede B', r.status === 200, `${r.status} ${r.code || ''}`);

  // Repete o isolamento com sessoes renovadas por refresh
  for (const key of ['ownerA', 'adminAcademia', 'recepcao', 'recepcaoFilial']) {
    s[key] = await refresh(s[key]);
    const old = await req('GET', '/auth/me', { token: s[key].oldToken });
    check(`[refresh] token anterior de ${key} invalido`, old.status === 401, `${old.status}`);
  }
  s.ownerB = await login(REDE_B_OWNER);
  s.ownerB = await refresh(s.ownerB);
  await verificarIsolamento('[refresh]', s);

  console.log(`[smoke-identidade] ${total - falhas}/${total} verificacoes OK`);
  process.exit(falhas ? 1 : 0);
}

main().catch((error) => {
  console.error(`[FALHOU] smoke-identidade: ${error.message}`);
  process.exit(1);
});
