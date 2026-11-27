// L04 · Baixa de conta com meio e estorno de baixa (sublote C, decisões de 20/11 e 26/11/2026).
// Roda sobre o SQLite descartável do runner (smoke-sqlite.ps1 -Playwright).
const { test, expect } = require('@playwright/test');
const { loginByUi } = require('../fixtures/auth');

const api = process.env.PLAYWRIGHT_API_URL;
const password = process.env.SEED_DEV_PASSWORD;
const run = Date.now().toString(36);
let seq = 0;

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

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dataBr = (iso) => iso.split('-').reverse().join('/');

test.describe('Baixa de conta e estorno de baixa', () => {
  test.skip(process.env.E2E_DISPOSABLE_SQLITE !== 'true', 'Use smoke-sqlite.ps1 -Playwright para criar a base descartável.');

  let owner; let admin; let financeiro;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    owner = await apiLogin(request, 'owner');
    admin = await apiLogin(request, 'admin.academia');
    financeiro = await apiLogin(request, 'financeiro');
    await request.dispose();
  });

  async function conta(request, status = 'pendente', extra = {}) {
    seq += 1;
    const descricao = `E2E C conta ${seq} ${run}`;
    const r = await request.post(`${api}/contas-financeiras`, {
      headers: financeiro.headers(),
      data: { descricao, tipo: 'despesa', valor: 150, data_lancamento: hoje(), status, ...extra },
    });
    expect(r.status()).toBe(201);
    return { id: (await r.json()).id, descricao };
  }

  async function abrirContas(page, descricao) {
    await page.goto('/financeiro/contas-financeiras');
    await page.getByLabel('Descrição').fill(descricao);
    const linha = page.locator('tr', { hasText: descricao });
    await expect(linha).toHaveCount(1);
    return linha;
  }

  test('financeiro dá baixa com Pix e solicita o estorno da baixa com motivo', async ({ page, request }) => {
    const { id, descricao } = await conta(request);
    await signIn(page, 'financeiro');
    const linha = await abrirContas(page, descricao);
    await linha.getByRole('button', { name: 'Confirmar' }).click();
    const baixa = page.getByRole('dialog', { name: `Baixa de ${descricao}` });
    await baixa.getByLabel('Meio (opcional)').selectOption('pix');
    const patch = watchResponse(page, 'PATCH', `/contas-financeiras/${id}/status`);
    await baixa.getByRole('button', { name: 'Confirmar baixa' }).click();
    const resposta = await patch;
    expect(resposta.status()).toBe(200);
    expect(resposta.request().postDataJSON()).toEqual({ status: 'pago', meio_baixa: 'pix' });
    await expect(linha.getByTestId(`baixa-${id}`)).toHaveText(`Baixa ${dataBr(hoje())} · Pix`);

    await linha.getByRole('button', { name: 'Estorno da baixa' }).click();
    const dialog = page.getByRole('dialog', { name: `Estorno da baixa: ${descricao}` });
    await expect(dialog.getByTestId('baixa-atual')).toContainText('Pix');
    await dialog.getByRole('button', { name: 'Solicitar estorno da baixa' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Informe o motivo');
    await dialog.getByLabel('Motivo do estorno da baixa').fill('Baixa lançada na conta errada');
    const solicitar = watchResponse(page, 'POST', `/contas-financeiras/${id}/estornos-baixa`);
    await dialog.getByRole('button', { name: 'Solicitar estorno da baixa' }).click();
    expect((await solicitar).status()).toBe(201);
    await expect(dialog.getByRole('list', { name: 'Pedidos de estorno de baixa' })).toContainText('Baixa lançada na conta errada');
    await expect(dialog.getByRole('button', { name: 'Aprovar estorno' })).toHaveCount(0);
    await expect(dialog.getByRole('form', { name: 'Registrar autorização externa' })).toBeVisible();
    await page.screenshot({ path: 'tests/e2e/results/l04c-estorno-baixa-solicitado.png' });
  });

  test('financeiro executa pela fila e a conta volta a pendente', async ({ page, request }) => {
    const { id, descricao } = await conta(request, 'pago', { meio_baixa: 'boleto' });
    const pedido = await (await request.post(`${api}/contas-financeiras/${id}/estornos-baixa`, { headers: financeiro.headers(), data: { motivo: 'Boleto devolvido pelo banco' } })).json();
    expect((await request.post(`${api}/contas-financeiras/estornos-baixa/${pedido.id}/aprovar`, { headers: owner.headers() })).status()).toBe(200);

    await signIn(page, 'financeiro');
    await page.goto('/financeiro/estornos-baixa');
    await page.getByRole('button', { name: 'Aguardando execução', exact: true }).click();
    const row = page.locator(`tr[data-estorno-baixa-id="${pedido.id}"]`);
    await expect(row).toContainText(descricao);
    await expect(row).toContainText('Boleto');
    await row.getByRole('button', { name: 'Abrir' }).click();
    const dialog = page.getByRole('dialog', { name: `Estorno da baixa: ${descricao}` });
    const form = dialog.getByRole('form', { name: 'Executar estorno da baixa' });
    await form.getByRole('button', { name: 'Executar estorno da baixa' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Confirme');
    await form.getByLabel('Confirmo que a conta deve voltar a pendente e sair do realizado').check();
    const executar = watchResponse(page, 'POST', /\/estornos-baixa\/\d+\/executar$/);
    await form.getByRole('button', { name: 'Executar estorno da baixa' }).click();
    expect((await executar).status()).toBe(200);
    await expect(dialog.getByRole('list', { name: 'Pedidos de estorno de baixa' })).toContainText('Estornada');
    await expect(dialog.getByTestId('baixa-atual')).toHaveText('Conta pendente');
    await expect(dialog.getByRole('button', { name: 'Solicitar estorno da baixa' })).toHaveCount(0);
    await page.screenshot({ path: 'tests/e2e/results/l04c-estorno-baixa-executado.png' });

    const linha = await abrirContas(page, descricao);
    await expect(linha).toContainText('Pendente');
    await expect(linha.getByRole('button', { name: 'Confirmar' })).toBeVisible();
  });

  test('admin não aprova o próprio pedido e conta paga antes do sublote mostra baixa estimada', async ({ page, request }) => {
    const { id, descricao } = await conta(request, 'pago');
    expect((await request.post(`${api}/contas-financeiras/${id}/estornos-baixa`, { headers: admin.headers(), data: { motivo: 'Teste de autoaprovação' } })).status()).toBe(201);
    await signIn(page, 'admin.academia');
    const linha = await abrirContas(page, descricao);
    await expect(linha.getByTestId(`baixa-${id}`)).toHaveText(`Baixa ${dataBr(hoje())} · Meio não registrado`);
    await linha.getByRole('button', { name: 'Estorno da baixa' }).click();
    const dialog = page.getByRole('dialog', { name: `Estorno da baixa: ${descricao}` });
    await expect(dialog.getByText('Você solicitou este estorno e não pode aprová-lo.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Aprovar estorno' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Fechar modal' }).click();

    await page.getByLabel('Descrição').fill('');
    await page.getByLabel('Status').selectOption('pago');
    await expect(page.getByText('(estimada)').first()).toBeVisible();
  });

  test('no celular a fila de estornos de baixa cabe na tela', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { id, descricao } = await conta(request, 'pago', { meio_baixa: 'dinheiro' });
    const pedido = await (await request.post(`${api}/contas-financeiras/${id}/estornos-baixa`, { headers: financeiro.headers(), data: { motivo: 'Celular' } })).json();
    await signIn(page, 'owner');
    await page.goto('/financeiro/estornos-baixa');
    const row = page.locator(`tr[data-estorno-baixa-id="${pedido.id}"]`);
    await expect(row).toContainText(descricao);
    const largura = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(largura.scroll).toBeLessThanOrEqual(largura.client + 1);
    await row.getByRole('button', { name: 'Abrir' }).click();
    const dialog = page.getByRole('dialog', { name: `Estorno da baixa: ${descricao}` });
    await dialog.getByRole('button', { name: 'Aprovar estorno' }).click();
    await expect(dialog.getByText('Autorizado. Aguardando execução.').or(dialog.getByRole('form', { name: 'Executar estorno da baixa' }))).toBeVisible();
    const larguras = await dialog.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(larguras.scroll).toBeLessThanOrEqual(larguras.client + 1);
    await page.screenshot({ path: 'tests/e2e/results/l04c-estorno-baixa-celular.png' });
  });
});
