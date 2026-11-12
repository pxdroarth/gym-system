// Smoke S1-P0 · Contenção (FV-02a reversões, FV-05 upload, FV-02c fechamento).
//
// Pré-requisitos: base DESCARTÁVEL criada com `npm run db:seed:dev` e a API
// rodando sobre ela. O smoke cria produtos/vendas/contas "S1P0 ...", fecha e
// reabre o mês corrente nas unidades e planta arquivos de teste em
// backend/uploads/produtos (removidos no fim). Rode depois do
// smoke-identidade, que cria a Rede B (smoke.owner.redeb); se ela não existir,
// o smoke a cria pelo onboarding com o platform_admin.
//
// Uso:
//   node tests/scripts/smoke-s1-p0.js --base-url=http://localhost:3001 --db=backend/academia.sqlite
// Opcional: --uploads-dir=backend/uploads/produtos
// Variáveis: SEED_DEV_PASSWORD (dev12345), SMOKE_PLATFORM_LOGIN (admin),
//            SMOKE_PLATFORM_PASSWORD (BOOTSTRAP_ADMIN_PASSWORD ou admin123).

const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const BASE = (args['base-url'] || process.env.SMOKE_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DB_PATH = path.resolve(args.db || 'backend/academia.sqlite');
const UPLOADS = path.resolve(args['uploads-dir'] || path.join(path.dirname(DB_PATH), 'uploads', 'produtos'));
const PW = process.env.SEED_DEV_PASSWORD || 'dev12345';
const RUN = Date.now().toString(36);

const resultados = {};
let reqAtual = 'geral';
function requisito(id) { reqAtual = id; resultados[id] = resultados[id] || { ok: 0, falhas: 0 }; console.log(`\n== ${id}`); }
function check(label, cond, extra = '') {
  const r = resultados[reqAtual];
  if (cond) r.ok += 1; else r.falhas += 1;
  console.log(`${cond ? '[OK]     ' : '[FALHOU] '}${label}${extra !== '' ? ` - ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
}

const sqlite3 = require(require.resolve('sqlite3', { paths: [process.cwd(), path.join(__dirname, '..', '..')] }));
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
const q = (sql, p = []) => new Promise((ok, ko) => db.all(sql, p, (e, rows) => (e ? ko(e) : ok(rows))));
const q1 = async (sql, p = []) => (await q(sql, p))[0];

async function req(method, p, { token, unit, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (unit) headers['X-Unit-Id'] = String(unit);
  let corpo;
  if (form) corpo = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; corpo = JSON.stringify(body); }
  const r = await fetch(BASE + p, { method, headers, body: corpo });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { json = null; }
  return { s: r.status, j: json, code: json?.code || null, buf, h: r.headers };
}

async function login(l, senha = PW) {
  const r = await req('POST', '/auth/login', { body: { login: l, senha } });
  if (r.s !== 200) throw new Error(`login ${l}: ${r.s} ${r.code}`);
  return { token: r.j.data.token, user: r.j.data.usuario };
}

async function redeB() {
  try { return await login('smoke.owner.redeb'); } catch (_) { /* cria abaixo */ }
  const platform = await login(process.env.SMOKE_PLATFORM_LOGIN || 'admin',
    process.env.SMOKE_PLATFORM_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin123');
  const r = await req('POST', '/onboarding/tenants', {
    token: platform.token,
    body: {
      tenant_nome: 'Rede B (smoke)', tenant_documento: 'smoke-identidade-rede-b', tenant_status: 'ativo',
      unit_nome: 'Matriz Rede B', unit_codigo: 'matriz',
      admin_nome: 'Owner Rede B (smoke)', admin_login: 'smoke.owner.redeb', admin_senha: PW,
    },
  });
  if (r.s !== 201) throw new Error(`onboarding Rede B: ${r.s} ${r.code}`);
  return login('smoke.owner.redeb');
}

// ---------- arquivos de imagem de teste ----------
const PNG_1x1 = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
  '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const JPEG_MIN = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 0), Buffer.from([0xff, 0xd9])]);
// WebP 1x1 sem perdas (RIFF....WEBPVP8L).
const WEBP_1x1 = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
const HTML = Buffer.from('<html><script>document.title="xss"</script></html>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>');

function formProduto(nome, arquivo, nomeArquivo, mime) {
  const fd = new FormData();
  fd.append('nome', nome); fd.append('preco', '10'); fd.append('estoque', '5');
  if (arquivo) fd.append('imagem', new Blob([arquivo], { type: mime }), nomeArquivo);
  return fd;
}
const arquivosNaPasta = () => (fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS).sort() : []);

// ---------- fotografia do estado afetado por uma reversao ----------
async function foto({ vendaId, produtoId, contaId, mensalidadeId }) {
  const [venda, produto, conta, mens, lanc, rev, aud] = await Promise.all([
    vendaId ? q1('SELECT reversao_controlada_id FROM venda_produto WHERE id = ?', [vendaId]) : null,
    produtoId ? q1('SELECT estoque FROM produto WHERE id = ?', [produtoId]) : null,
    contaId ? q1('SELECT reversao_controlada_id, status, valor FROM conta_financeira WHERE id = ?', [contaId]) : null,
    mensalidadeId ? q1('SELECT status, reversao_controlada_id FROM mensalidade WHERE id = ?', [mensalidadeId]) : null,
    q1("SELECT COUNT(*) AS n, ROUND(COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE -valor END), 0), 2) AS liquido FROM conta_financeira WHERE deleted_at IS NULL"),
    q1('SELECT COUNT(*) AS n FROM reversao_controlada'),
    q1('SELECT COUNT(*) AS n FROM audit_log'),
  ]);
  return JSON.stringify({ venda, produto, conta, mens, lanc, rev: rev.n, aud: aud.n });
}

async function negar(label, fotoArgs, chamada, statusEsperado, codigoEsperado) {
  const antes = await foto(fotoArgs);
  const r = await chamada();
  const depois = await foto(fotoArgs);
  check(`${label} -> ${statusEsperado}${codigoEsperado ? ` ${codigoEsperado}` : ''}`,
    r.s === statusEsperado && (!codigoEsperado || r.code === codigoEsperado), `${r.s} ${r.code || ''}`);
  check(`${label}: estoque, saldos, lancamentos, reversoes e auditoria inalterados`, antes === depois,
    antes === depois ? '' : `antes=${antes} depois=${depois}`);
}

(async () => {
  const owner = await login('owner');
  const recepcao = await login('recepcao');
  const financeiro = await login('financeiro');
  const ownerB = await redeB();
  const unidades = owner.user.allowedUnits;
  const matriz = Number(unidades.find((u) => u.codigo === 'matriz').id);
  const filial = Number(unidades.find((u) => u.codigo === 'filial').id);
  const hoje = new Date().toISOString().slice(0, 10);

  async function produtoComEstoque(unit, nome, estoque = 10) {
    const fd = new FormData(); fd.append('nome', `${nome} ${RUN}`); fd.append('preco', '25'); fd.append('estoque', String(estoque));
    const r = await req('POST', '/produtos', { token: owner.token, unit, form: fd });
    if (r.s !== 201) throw new Error(`setup produto: ${r.s} ${r.code}`);
    return r.j;
  }
  async function vender(unit, produtoId, quantidade = 2) {
    const r = await req('POST', '/vendas-produtos', { token: owner.token, unit, body: { produto_id: produtoId, quantidade } });
    if (r.s !== 201) throw new Error(`setup venda: ${r.s} ${r.code}`);
    return r.j;
  }
  async function contaManual(unit, valor = 120) {
    const r = await req('POST', '/contas-financeiras', { token: owner.token, unit, body: { descricao: `S1P0 conta ${RUN}`, tipo: 'despesa', valor, data_lancamento: hoje, status: 'pago' } });
    if (r.s !== 201) throw new Error(`setup conta: ${r.s} ${r.code}`);
    return r.j.id;
  }
  async function mensalidadeLegadaPaga(unitId) {
    // Mensalidade paga do seed, sem pagamento no modelo novo (reversao em bloco valida).
    return q1(`SELECT m.id FROM mensalidade m WHERE m.status = 'pago' AND m.unit_id = ? AND m.reversao_controlada_id IS NULL
               AND m.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM pagamento p WHERE p.mensalidade_id = m.id AND p.lancamento_id IS NOT NULL)
               ORDER BY m.id LIMIT 1`, [unitId]);
  }

  // =====================================================================
  requisito('FV-02a reversoes');
  const prodA = await produtoComEstoque(matriz, 'S1P0 prod A');
  const vendaA = await vender(matriz, prodA.id, 2);
  const contaA = await contaManual(matriz);
  const mensA = await mensalidadeLegadaPaga(matriz);
  const lancVendaA = await q1("SELECT id FROM conta_financeira WHERE origem = 'venda_produto' AND origem_id = ?", [vendaA.id]);
  const fv = { vendaId: vendaA.id, produtoId: prodA.id };
  const fc = { contaId: contaA };
  const fm = { mensalidadeId: mensA?.id };
  check('setup: venda, conta manual e mensalidade legada paga na Matriz da Rede A', Boolean(vendaA.id && contaA && mensA?.id && lancVendaA?.id));

  // outra Rede
  await negar('Rede B reverte venda da Rede A por /reversoes/vendas', fv,
    () => req('POST', `/reversoes/vendas/${vendaA.id}`, { token: ownerB.token, body: { motivo: 'outra rede' } }), 404, 'VENDA_NAO_ENCONTRADA');
  await negar('Rede B reverte venda da Rede A por /vendas-produtos/:id/reverter', fv,
    () => req('POST', `/vendas-produtos/${vendaA.id}/reverter`, { token: ownerB.token, body: { motivo: 'outra rede' } }), 404, 'VENDA_NAO_ENCONTRADA');
  await negar('Rede B reverte conta da Rede A por /reversoes/contas-financeiras', fc,
    () => req('POST', `/reversoes/contas-financeiras/${contaA}`, { token: ownerB.token, body: { motivo: 'outra rede' } }), 404, 'CONTA_NAO_ENCONTRADA');
  await negar('Rede B reverte conta da Rede A por /contas-financeiras/:id/reverter', fc,
    () => req('POST', `/contas-financeiras/${contaA}/reverter`, { token: ownerB.token, body: { motivo: 'outra rede' } }), 404, 'CONTA_NAO_ENCONTRADA');
  await negar('Rede B reverte mensalidade da Rede A por /reversoes/mensalidades', fm,
    () => req('POST', `/reversoes/mensalidades/${mensA.id}`, { token: ownerB.token, body: { motivo: 'outra rede' } }), 404, 'MENSALIDADE_NAO_ENCONTRADA');
  await negar('Rede B reverte mensalidade da Rede A por /mensalidades/:id/reverter', fm,
    () => req('POST', `/mensalidades/${mensA.id}/reverter`, { token: ownerB.token, body: { motivo: 'outra rede' } }), 404, 'MENSALIDADE_NAO_ENCONTRADA');

  // outra Unidade da mesma Rede (owner operando na Filial)
  await negar('Filial reverte venda da Matriz por /reversoes/vendas', fv,
    () => req('POST', `/reversoes/vendas/${vendaA.id}`, { token: owner.token, unit: filial, body: { motivo: 'outra unidade' } }), 404, 'VENDA_NAO_ENCONTRADA');
  await negar('Filial reverte conta da Matriz por /reversoes/contas-financeiras', fc,
    () => req('POST', `/reversoes/contas-financeiras/${contaA}`, { token: owner.token, unit: filial, body: { motivo: 'outra unidade' } }), 404, 'CONTA_NAO_ENCONTRADA');
  await negar('Filial reverte mensalidade da Matriz por /reversoes/mensalidades', fm,
    () => req('POST', `/reversoes/mensalidades/${mensA.id}`, { token: owner.token, unit: filial, body: { motivo: 'outra unidade' } }), 404, 'MENSALIDADE_NAO_ENCONTRADA');

  // sem permissao e lancamento derivado
  await negar('recepcao (sem reversao:executar) reverte venda por /reversoes/vendas', fv,
    () => req('POST', `/reversoes/vendas/${vendaA.id}`, { token: recepcao.token, body: { motivo: 'sem permissao' } }), 403, 'PERMISSAO_NEGADA');
  await negar('recepcao reverte conta por /reversoes/contas-financeiras', fc,
    () => req('POST', `/reversoes/contas-financeiras/${contaA}`, { token: recepcao.token, body: { motivo: 'sem permissao' } }), 403, 'PERMISSAO_NEGADA');
  await negar('owner reverte lancamento DERIVADO da venda por /reversoes/contas-financeiras', fv,
    () => req('POST', `/reversoes/contas-financeiras/${lancVendaA.id}`, { token: owner.token, unit: matriz, body: { motivo: 'derivado' } }), 409, 'CONTA_FINANCEIRA_DERIVADA_PROTEGIDA');

  // A DN-3 retirou a execucao direta. As fotos comprovam ausencia de efeitos.
  const bloqueio = 'REVERSAO_APROVACAO_NECESSARIA';
  const motivo = { motivo: 'Solicitacao sem aprovacao registrada' };
  await negar('financeiro nao reverte venda sem aprovacao', fv,
    () => req('POST', `/reversoes/vendas/${vendaA.id}`, { token: financeiro.token, body: motivo }), 409, bloqueio);
  await negar('owner nao reverte conta manual sem aprovacao', fc,
    () => req('POST', `/reversoes/contas-financeiras/${contaA}`, { token: owner.token, unit: matriz, body: motivo }), 409, bloqueio);
  await negar('owner nao exclui conta paga sem aprovacao', fc,
    () => req('DELETE', `/contasFinanceiras/${contaA}`, { token: owner.token, unit: matriz, body: motivo }), 409, bloqueio);
  await negar('owner nao reverte mensalidade legada sem aprovacao', fm,
    () => req('POST', `/reversoes/mensalidades/${mensA.id}`, { token: owner.token, unit: matriz, body: motivo }), 409, bloqueio);
  for (const rota of ['vendas-produtos', 'vendasProdutos']) {
    await negar(`${rota} respeita aprovacao`, fv,
      () => req('POST', `/${rota}/${vendaA.id}/reverter`, { token: owner.token, unit: matriz, body: motivo }), 409, bloqueio);
  }
  let r;

  // =====================================================================
  requisito('FV-05 upload');
  const plantados = ['s1p0-ativo.html', 's1p0-ativo.svg', 's1p0-ativo.js', 's1p0-falso.png', 's1p0-real.png'];
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS, plantados[0]), HTML);
  fs.writeFileSync(path.join(UPLOADS, plantados[1]), SVG);
  fs.writeFileSync(path.join(UPLOADS, plantados[2]), 'alert(1)');
  fs.writeFileSync(path.join(UPLOADS, plantados[3]), HTML);
  fs.writeFileSync(path.join(UPLOADS, plantados[4]), PNG_1x1);
  const base = arquivosNaPasta();

  async function semArquivoNovo(label, chamada, status, codigo) {
    const antesArq = arquivosNaPasta();
    const nProd = (await q1('SELECT COUNT(*) AS n FROM produto')).n;
    const resp = await chamada();
    const depoisArq = arquivosNaPasta();
    const nProdDepois = (await q1('SELECT COUNT(*) AS n FROM produto')).n;
    check(`${label} -> ${status}${codigo ? ` ${codigo}` : ''}`, resp.s === status && (!codigo || resp.code === codigo), `${resp.s} ${resp.code || ''}`);
    check(`${label}: nenhum arquivo novo em disco e nenhum produto criado`,
      JSON.stringify(antesArq) === JSON.stringify(depoisArq) && nProd === nProdDepois,
      `arquivos ${antesArq.length}->${depoisArq.length}, produtos ${nProd}->${nProdDepois}`);
    return resp;
  }

  await semArquivoNovo('sem login, .html', () => req('POST', '/produtos', { form: formProduto('', HTML, 'x.html', 'text/html') }), 401);
  await semArquivoNovo('token invalido, PNG valido', () => req('POST', '/produtos', { token: 'tok-invalido', form: formProduto(`S1P0 tok ${RUN}`, PNG_1x1, 'a.png', 'image/png') }), 401);
  await semArquivoNovo('recepcao com X-Unit-Id da Filial (unidade nao permitida)', () => req('POST', '/produtos', { token: recepcao.token, unit: filial, form: formProduto(`S1P0 unit ${RUN}`, PNG_1x1, 'a.png', 'image/png') }), 403, 'UNIT_FORBIDDEN');
  await semArquivoNovo('owner, HTML disfarcado de PNG (nome .png, tipo image/png)', () => req('POST', '/produtos', { token: owner.token, unit: matriz, form: formProduto(`S1P0 html ${RUN}`, HTML, 'foto.png', 'image/png') }), 400, 'IMAGEM_TIPO_INVALIDO');
  await semArquivoNovo('owner, SVG', () => req('POST', '/produtos', { token: owner.token, unit: matriz, form: formProduto(`S1P0 svg ${RUN}`, SVG, 'logo.svg', 'image/svg+xml') }), 400, 'IMAGEM_TIPO_INVALIDO');
  await semArquivoNovo('owner, PNG valido com payload invalido (nome vazio)', () => req('POST', '/produtos', { token: owner.token, unit: matriz, form: formProduto('', PNG_1x1, 'a.png', 'image/png') }), 400);
  const grande = Buffer.concat([PNG_1x1, Buffer.alloc(2 * 1024 * 1024)]);
  await semArquivoNovo('owner, PNG acima de 2 MB', () => req('POST', '/produtos', { token: owner.token, unit: matriz, form: formProduto(`S1P0 grande ${RUN}`, grande, 'g.png', 'image/png') }), 413, 'IMAGEM_GRANDE_DEMAIS');
  await semArquivoNovo('owner, nome de produto duplicado com PNG valido', () => req('POST', '/produtos', { token: owner.token, unit: matriz, form: formProduto(prodA.nome, PNG_1x1, 'a.png', 'image/png') }), 409);

  r = await req('POST', '/produtos', { token: owner.token, unit: matriz, form: formProduto(`S1P0 com foto ${RUN}`, PNG_1x1, 'qualquer-nome.html', 'text/html') });
  const novos = arquivosNaPasta().filter((f) => !base.includes(f));
  check('owner, PNG valido (nome e tipo do cliente ignorados) -> 201 e 1 arquivo .png gravado',
    r.s === 201 && novos.length === 1 && novos[0].endsWith('.png') && r.j?.imagem === `/uploads/produtos/${novos[0]}`, `${r.s} novos=${novos.join(',')} imagem=${r.j?.imagem}`);
  const prodFoto = r.j;
  let g = await req('GET', prodFoto?.imagem || '/uploads/produtos/x.png');
  check('imagem publicada: 200, image/png, nosniff, mesmo conteudo',
    g.s === 200 && g.h.get('content-type') === 'image/png' && g.h.get('x-content-type-options') === 'nosniff' && g.buf.equals(PNG_1x1),
    `${g.s} ${g.h.get('content-type')}`);
  const antesWebp = arquivosNaPasta();
  r = await req('POST', '/produtos', { token: owner.token, unit: matriz, form: formProduto(`S1P0 webp ${RUN}`, WEBP_1x1, 'foto.webp', 'image/webp') });
  const novosWebp = arquivosNaPasta().filter((f) => !antesWebp.includes(f));
  check('owner, WebP valido -> 201 e 1 arquivo .webp gravado',
    r.s === 201 && novosWebp.length === 1 && novosWebp[0].endsWith('.webp') && r.j?.imagem === `/uploads/produtos/${novosWebp[0]}`, `${r.s} novos=${novosWebp.join(',')} imagem=${r.j?.imagem}`);
  g = await req('GET', r.j?.imagem || '/uploads/produtos/x.webp');
  check('WebP publicado: 200, image/webp, nosniff, mesmo conteudo',
    g.s === 200 && g.h.get('content-type') === 'image/webp' && g.h.get('x-content-type-options') === 'nosniff' && g.buf.equals(WEBP_1x1),
    `${g.s} ${g.h.get('content-type')}`);
  r = await req('PUT', `/produtos/${prodFoto.id}`, { token: owner.token, unit: matriz, form: formProduto(`S1P0 com foto ${RUN}`, JPEG_MIN, 'nova.jpg', 'image/jpeg') });
  g = await req('GET', r.j?.imagem || '/uploads/produtos/x.jpg');
  check('PUT com JPEG valido -> 200 e imagem nova servida como image/jpeg', r.s === 200 && r.j?.imagem?.endsWith('.jpg') && g.s === 200 && g.h.get('content-type') === 'image/jpeg', `${r.s} ${g.s} ${g.h.get('content-type')}`);
  const antesPut = arquivosNaPasta();
  r = await req('PUT', `/produtos/${prodFoto.id}`, { token: owner.token, unit: matriz, form: formProduto(`S1P0 com foto ${RUN}`, HTML, 'x.jpg', 'image/jpeg') });
  check('PUT com HTML disfarcado -> 400 e nenhum arquivo novo; imagem anterior mantida',
    r.s === 400 && JSON.stringify(antesPut) === JSON.stringify(arquivosNaPasta()) && (await q1('SELECT imagem FROM produto WHERE id = ?', [prodFoto.id])).imagem.endsWith('.jpg'), `${r.s} ${r.code}`);
  r = await req('POST', '/produtos', { token: recepcao.token, form: formProduto(`S1P0 recepcao ${RUN}`, PNG_1x1, 'r.png', 'image/png') });
  check('recepcao (Matriz) com PNG valido -> 201: permissao por papel inalterada (FV-02b fora deste lote)', r.s === 201, `${r.s} ${r.code || ''}`);

  for (const nome of plantados.slice(0, 4)) {
    g = await req('GET', `/uploads/produtos/${nome}`);
    check(`arquivo ativo ja existente na pasta nao e publicado: ${nome} -> 404`, g.s === 404, `${g.s} ${g.h.get('content-type') || ''}`);
  }
  g = await req('GET', `/uploads/produtos/${plantados[4]}`);
  check('PNG legitimo ja existente continua publicado -> 200 image/png', g.s === 200 && g.h.get('content-type') === 'image/png', `${g.s} ${g.h.get('content-type')}`);
  const legados = base.filter((f) => /\.jpe?g$/i.test(f) && !f.startsWith('s1p0-'));
  if (legados.length) {
    g = await req('GET', `/uploads/produtos/${legados[0]}`);
    check(`imagem legada do seed continua publicada (${legados[0]})`, g.s === 200 && g.h.get('content-type') === 'image/jpeg', `${g.s} ${g.h.get('content-type')}`);
  }
  g = await req('GET', '/uploads/produtos/..%2F..%2Fserver.js');
  check('caminho com ../ fora da pasta -> 404', g.s === 404, g.s);
  g = await req('GET', '/uploads/produtos/inexistente.png');
  check('imagem inexistente -> 404', g.s === 404, g.s);
  for (const nome of plantados) fs.rmSync(path.join(UPLOADS, nome), { force: true });

  // =====================================================================
  requisito('FV-02c fechamento');
  const [ano, mes] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))];
  const prodM = await produtoComEstoque(matriz, 'S1P0 fech matriz');
  const prodF = await produtoComEstoque(filial, 'S1P0 fech filial');
  async function tentativaVenda(label, unit, produtoId, statusEsperado, codigoEsperado) {
    const e0 = (await q1('SELECT estoque FROM produto WHERE id = ?', [produtoId])).estoque;
    const v0 = (await q1('SELECT COUNT(*) AS n FROM venda_produto WHERE produto_id = ?', [produtoId])).n;
    const resp = await req('POST', '/vendas-produtos', { token: owner.token, unit, body: { produto_id: produtoId, quantidade: 1 } });
    const e1 = (await q1('SELECT estoque FROM produto WHERE id = ?', [produtoId])).estoque;
    const v1 = (await q1('SELECT COUNT(*) AS n FROM venda_produto WHERE produto_id = ?', [produtoId])).n;
    check(`${label} -> ${statusEsperado}${codigoEsperado ? ` ${codigoEsperado}` : ''}`, resp.s === statusEsperado && (!codigoEsperado || resp.code === codigoEsperado), `${resp.s} ${resp.code || ''}`);
    if (statusEsperado === 423) check(`${label}: sem venda e sem baixa`, e0 === e1 && v0 === v1, `estoque ${e0}->${e1}, vendas ${v0}->${v1}`);
    else check(`${label}: venda gravada e estoque baixado em 1`, e1 === e0 - 1 && v1 === v0 + 1, `estoque ${e0}->${e1}, vendas ${v0}->${v1}`);
  }

  r = await req('POST', `/fechamento-mensal/${ano}/${mes}/fechar`, { token: owner.token, unit: matriz });
  check(`setup: ${mes}/${ano} fechado na Matriz (Unidade A)`, r.s === 200 && String(r.j?.fechamento?.status).startsWith('fechado'), `${r.s} ${r.j?.fechamento?.status}`);
  await tentativaVenda('venda na Matriz com o mes fechado na Matriz', matriz, prodM.id, 423, 'PERIODO_FECHADO');
  await tentativaVenda('venda na Filial (Unidade B, mes aberto)', filial, prodF.id, 201);
  r = await req('POST', `/fechamento-mensal/${ano}/${mes}/reabrir`, { token: owner.token, unit: matriz, body: { motivo: 'Conferencia no smoke L02' } });
  check('setup: Matriz reaberta', r.s === 200, r.s);

  r = await req('POST', `/fechamento-mensal/${ano}/${mes}/fechar`, { token: owner.token, unit: filial });
  check(`setup: ${mes}/${ano} fechado so na Filial`, r.s === 200, r.s);
  await tentativaVenda('venda na Filial com o mes fechado na Filial', filial, prodF.id, 423, 'PERIODO_FECHADO');
  await tentativaVenda('venda na Matriz (mes aberto na Matriz, fechado na Filial)', matriz, prodM.id, 201);
  r = await req('POST', `/fechamento-mensal/${ano}/${mes}/reabrir`, { token: owner.token, unit: filial, body: { motivo: 'Conferencia no smoke L02' } });
  check('setup: Filial reaberta (base volta ao estado aberto)', r.s === 200, r.s);

  // ---------- resumo ----------
  console.log('\nResumo por requisito:');
  let falhas = 0;
  for (const [id, r0] of Object.entries(resultados)) {
    falhas += r0.falhas;
    console.log(`  ${id}: ${r0.ok}/${r0.ok + r0.falhas} OK`);
  }
  db.close();
  process.exit(falhas ? 1 : 0);
})().catch((error) => {
  console.error('[ERRO]', error);
  db.close();
  process.exit(1);
});
