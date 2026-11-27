// L04 · Fechamento mensal com conferência por meio e ressalva (sublote D).
// Roda sobre o SQLite descartável do runner (smoke-sqlite.ps1 -Playwright).
// Os fechamentos usam meses de 2032 para não travar o mês corrente dos outros testes.
const { test, expect } = require('@playwright/test');
const { loginByUi } = require('../fixtures/auth');

const api = process.env.PLAYWRIGHT_API_URL;
const password = process.env.SEED_DEV_PASSWORD;
const run = Date.now().toString(36);

function watchResponse(page, method, pattern) {
  return page.waitForResponse((response) => response.request().method() === method
    && (typeof pattern === 'string' ? new URL(response.url()).pathname === pattern : pattern.test(new URL(response.url()).pathname)));
}

async function signIn(page, login) {
  await page.goto('/login');
  const response = watchResponse(page, 'POST', '/auth/login');
  await loginByUi(page, { login, password });
  expect((await response).ok()).toBe(true);
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function apiLogin(request, login) {
  const response = await request.post(`${api}/auth/login`, { data: { login, senha: password } });
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  const matriz = data.usuario.allowedUnits.find((unit) => unit.codigo === 'matriz');
  return { user: data.usuario, headers: () => ({ Authorization: `Bearer ${data.token}`, 'X-Unit-Id': String(matriz.id) }) };
}

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function abrirMes(page, periodo) {
  await page.goto('/financeiro/fechamento');
  await page.getByLabel('Mês').fill(periodo);
}

test.describe('Fechamento mensal', () => {
  test.skip(process.env.E2E_DISPOSABLE_SQLITE !== 'true', 'Use smoke-sqlite.ps1 -Playwright para criar a base descartável.');

  let owner; let admin; let financeiro;
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    owner = await apiLogin(request, 'owner');
    admin = await apiLogin(request, 'admin.academia');
    financeiro = await apiLogin(request, 'financeiro');
    await request.dispose();
  });

  test('financeiro confere o mês por meio e não fecha', async ({ page, request }) => {
    const r = await request.post(`${api}/contas-financeiras`, {
      headers: financeiro.headers(),
      data: { descricao: `E2E D receita ${run}`, tipo: 'receita', valor: 40, data_lancamento: hoje(), status: 'pago', meio_baixa: 'transferencia' },
    });
    expect(r.status()).toBe(201);
    const [ano, mes] = hoje().split('-').map(Number);
    const situacao = await (await request.get(`${api}/fechamento-mensal/${ano}/${mes}`, { headers: financeiro.headers() })).json();
    const transf = situacao.analise.conferencia.meios.find((m) => m.meio === 'transferencia');
    expect(transf.contas_entrada).toBeGreaterThanOrEqual(40);

    await signIn(page, 'financeiro');
    await page.goto('/financeiro/fechamento');
    const tabela = page.getByRole('table', { name: 'Conferência por meio do mês' });
    await expect(tabela.locator('tr[data-meio="transferencia"]')).toContainText(brl(transf.liquido));
    await expect(tabela.locator('tr[data-meio="total"]')).toContainText(brl(situacao.analise.conferencia.total.liquido));
    await expect(page.getByTestId('status-fechamento')).toContainText('Aberto');
    await expect(page.getByRole('button', { name: 'Fechar mês' })).toHaveCount(0);
    await expect(page.getByText('O fechamento é feito pelo dono ou pelo admin da unidade.')).toBeVisible();
  });

  test('admin fecha um mês sem divergência; só o dono reabre com motivo', async ({ page, browser }) => {
    await signIn(page, 'admin.academia');
    await abrirMes(page, '2032-06');
    await expect(page.getByTestId('sem-divergencias')).toBeVisible();
    const fechar = watchResponse(page, 'POST', '/fechamento-mensal/2032/6/fechar');
    await page.getByRole('button', { name: 'Fechar mês' }).click();
    expect((await fechar).status()).toBe(200);
    await expect(page.getByTestId('status-fechamento')).toContainText('Fechado');
    await expect(page.getByRole('form', { name: 'Reabrir mês' })).toHaveCount(0);

    const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    page = await contexto.newPage();
    await signIn(page, 'owner');
    await abrirMes(page, '2032-06');
    const form = page.getByRole('form', { name: 'Reabrir mês' });
    await form.getByRole('button', { name: 'Reabrir mês' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Informe o motivo da reabertura');
    await form.getByLabel('Motivo da reabertura').fill('E2E: reabertura do teste');
    const reabrir = watchResponse(page, 'POST', '/fechamento-mensal/2032/6/reabrir');
    await form.getByRole('button', { name: 'Reabrir mês' }).click();
    expect((await reabrir).status()).toBe(200);
    await expect(page.getByTestId('status-fechamento')).toContainText('Reaberto');
    await contexto.close();
  });

  test('com divergência, o dono só fecha com ressalva completa', async ({ page }) => {
    // A análise real de 05/2032 é vazia; a resposta é complementada com uma
    // divergência para exercitar a tela. A trava no servidor está no smoke.
    await page.route(/\/fechamento-mensal\/2032\/5$/, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.analise.inconsistencias = [{ tipo: 'lancamento_financeiro_orfao', registro_id: 999, chave: 'lancamento_financeiro_orfao:999', modulo: 'financeiro' }];
      await route.fulfill({ response, json: body });
    });
    await signIn(page, 'owner');
    await abrirMes(page, '2032-05');
    await expect(page.getByRole('list', { name: 'Lista de divergências' })).toContainText('Lançamento sem registro de origem');
    await expect(page.getByRole('button', { name: 'Fechar mês' })).toHaveCount(0);
    const form = page.getByRole('form', { name: 'Fechar com ressalva' });
    await form.getByRole('button', { name: 'Fechar com ressalva' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Informe o motivo da ressalva');
    await form.getByLabel('Motivo da ressalva').fill('Lançamento em conciliação com o banco');
    await form.getByLabel('Evidência (documento, chamado ou comprovante)').fill('Chamado 123');
    await form.getByLabel('Valor da diferença (opcional)').fill('9,90');
    await form.getByRole('button', { name: 'Fechar com ressalva' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Informe o responsável');
    await form.getByLabel('Responsável pelo acompanhamento').selectOption(String(financeiro.user.id));
    const fechar = watchResponse(page, 'POST', '/fechamento-mensal/2032/5/fechar');
    await form.getByRole('button', { name: 'Fechar com ressalva' }).click();
    const resposta = await fechar;
    expect(resposta.status()).toBe(200);
    expect(resposta.request().postDataJSON()).toEqual({
      ressalva: { motivo: 'Lançamento em conciliação com o banco', evidencia: 'Chamado 123', valor: 9.9, responsavel_id: financeiro.user.id },
    });
    await page.unroute(/\/fechamento-mensal\/2032\/5$/);
    const reabrir = await page.request.post(`${api}/fechamento-mensal/2032/5/reabrir`, { headers: owner.headers(), data: { motivo: 'E2E: limpeza' } });
    expect(reabrir.status()).toBe(200);
  });

  test('no celular a conferência rola dentro da tabela e a página não estoura', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, 'owner');
    await page.goto('/financeiro/fechamento');
    await expect(page.getByRole('table', { name: 'Conferência por meio do mês' })).toBeVisible();
    const largura = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(largura.scroll).toBeLessThanOrEqual(largura.client + 1);
    await page.screenshot({ path: 'tests/e2e/results/l04d-fechamento-celular.png' });
  });
});
