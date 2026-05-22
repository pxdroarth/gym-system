const { test } = require('@playwright/test');
const {
  expectAuthenticatedDashboard,
  expectLoginPage,
  expectNoPersistedAuthToken,
  expectRefreshCookie,
  getE2ECredentials,
  loginByUi,
} = require('../fixtures/auth');

const credentials = getE2ECredentials();

test.describe('auth', () => {
  test.skip(!credentials, 'Defina E2E_LOGIN e E2E_PASSWORD para rodar a suite real de autenticacao.');

  test('login, reload com refresh cookie, storage limpo e logout', async ({ page, context }) => {
    await page.goto('/login');
    await expectLoginPage(page);

    await loginByUi(page, credentials);
    await expectAuthenticatedDashboard(page);
    await expectRefreshCookie(context);
    await expectNoPersistedAuthToken(page);

    await page.reload();
    await expectAuthenticatedDashboard(page);
    await expectRefreshCookie(context);
    await expectNoPersistedAuthToken(page);

    await page.goto('/dashboard');
    await expectAuthenticatedDashboard(page);

    await page.getByTitle('Sair').click();
    await expectLoginPage(page);
    await expectNoPersistedAuthToken(page);

    await page.goto('/dashboard');
    await expectLoginPage(page);
  });
});
