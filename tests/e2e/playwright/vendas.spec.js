const { test, expect } = require('@playwright/test');
const { loginByUi } = require('../fixtures/auth');

const api = process.env.PLAYWRIGHT_API_URL;
const password = process.env.SEED_DEV_PASSWORD;
const productName = 'Agua Mineral 500ml';
const quantity = 2;

function watchResponse(page, method, path) {
  return page.waitForResponse((response) =>
    response.request().method() === method && new URL(response.url()).pathname === path
  );
}

async function signIn(page, login) {
  await page.goto('/login');
  const response = watchResponse(page, 'POST', '/auth/login');
  await loginByUi(page, { login, password });
  const loginResponse = await response;
  expect(loginResponse.ok()).toBe(true);
  await expect(page).toHaveURL(/\/dashboard$/);
  return (await loginResponse.json()).data;
}

async function productStock(request, session, unitId) {
  const response = await request.get(`${api}/produtos`, {
    headers: { Authorization: `Bearer ${session.token}`, 'X-Unit-Id': String(unitId) },
  });
  expect(response.ok()).toBe(true);
  const product = (await response.json()).find((item) => item.nome === productName);
  expect(product).toBeTruthy();
  return product;
}

test.describe('Cadastro de venda', () => {
  test.skip(process.env.E2E_DISPOSABLE_SQLITE !== 'true', 'Use smoke-sqlite.ps1 -Playwright para criar a base descartável.');

  for (const { login, code } of [{ login: 'recepcao', code: 'matriz' }, { login: 'owner', code: 'filial' }]) {
    test(`${login} registra venda na ${code}, vê a venda e baixa o estoque da unidade`, async ({ page, request }) => {
      const session = await signIn(page, login);
      const unit = session.usuario.allowedUnits.find((item) => item.codigo === code);
      const other = session.usuario.allowedUnits.find((item) => item.id !== unit.id);
      const otherBefore = other && await productStock(request, session, other.id);
      if (other) await page.getByRole('combobox', { name: 'Selecionar unidade' }).selectOption(String(unit.id));
      await page.getByRole('link', { name: 'Vendas', exact: true }).click();
      await expect(page.locator('main').getByText(unit.nome, { exact: true })).toBeVisible();

      await page.getByLabel('Data inicial').fill('2025-01-01');
      await page.getByLabel('Data final').fill('2025-01-01');
      await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
      await expect(page.getByText('Nenhuma venda encontrada.', { exact: true })).toBeVisible();

      const before = await productStock(request, session, unit.id);
      await page.getByRole('button', { name: 'Nova venda', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Registrar Venda' });
      await dialog.getByLabel('Produto').selectOption(String(before.id));
      await dialog.getByLabel('Quantidade').fill(String(quantity));
      const pending = watchResponse(page, 'POST', '/vendas-produtos');
      await dialog.getByRole('button', { name: 'Registrar Venda', exact: true }).click();
      const response = await pending;
      expect(response.status()).toBe(201);
      expect(response.request().headers()['x-unit-id']).toBe(String(unit.id));
      const sale = await response.json();
      await expect(dialog).toBeHidden();
      const row = page.locator(`tr[data-venda-id="${sale.id}"]`);
      await expect(row).toContainText(productName);
      await expect(row.getByRole('cell', { name: String(quantity), exact: true })).toBeVisible();
      const after = await productStock(request, session, unit.id);
      expect(after.estoque).toBe(before.estoque - quantity);
      if (other) expect((await productStock(request, session, other.id)).estoque).toBe(otherBefore.estoque);
    });
  }

  test('operador de acesso não vê o cadastro e a API recusa a venda', async ({ page, request }) => {
    const session = await signIn(page, 'operador');
    const unit = session.usuario.allowedUnits.find((item) => item.codigo === 'matriz');
    const before = await productStock(request, session, unit.id);
    await expect(page.getByRole('link', { name: 'Vendas', exact: true })).toHaveCount(0);
    const products = watchResponse(page, 'GET', '/produtos');
    await page.goto('/vendas-produtos');
    const currentScope = (await products).request();
    const authorization = await currentScope.headerValue('authorization');
    await expect(page.getByRole('heading', { name: 'Vendas de Produtos' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Nova venda|Registrar Venda/i })).toHaveCount(0);
    const response = await request.post(`${api}/vendas-produtos`, {
      headers: { Authorization: authorization, 'X-Unit-Id': String(unit.id) },
      data: { produto_id: before.id, quantidade: quantity },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe('PERMISSAO_NEGADA');
    const currentSession = { token: authorization.slice('Bearer '.length) };
    expect((await productStock(request, currentSession, unit.id)).estoque).toBe(before.estoque);
  });
});
