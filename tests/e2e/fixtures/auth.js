const { expect } = require('@playwright/test');

function getE2ECredentials() {
  const login = String(process.env.E2E_LOGIN || '').trim();
  const password = String(process.env.E2E_PASSWORD || '').trim();

  if (!login || !password) {
    return null;
  }

  return { login, password };
}

async function loginByUi(page, credentials) {
  await page.getByLabel('Login ou email').fill(credentials.login);
  await page.getByLabel('Senha').fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function expectAuthenticatedDashboard(page) {
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard Geral' })).toBeVisible();
}

async function expectLoginPage(page) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Academia SA' })).toBeVisible();
}

async function expectNoPersistedAuthToken(page) {
  const storages = await page.evaluate(() => {
    const read = (storage) => {
      const entries = {};
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        entries[key] = storage.getItem(key);
      }
      return entries;
    };

    return {
      local: read(window.localStorage),
      session: read(window.sessionStorage),
    };
  });

  const storageKeys = [...Object.keys(storages.local), ...Object.keys(storages.session)];
  const storageValues = [...Object.values(storages.local), ...Object.values(storages.session)]
    .filter((value) => typeof value === 'string');

  expect(storageKeys).not.toContain('academia_sa_auth_token');
  expect(storageKeys).not.toContain('academia_sa_auth_user');
  expect(storageValues.some((value) => /bearer\s+/i.test(value))).toBe(false);
}

async function expectRefreshCookie(context) {
  const apiBaseUrl = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3001';
  const cookies = await context.cookies([`${apiBaseUrl}/auth`]);
  const refreshCookie = cookies.find((cookie) => cookie.name === 'academia_sa_refresh');

  expect(refreshCookie).toBeTruthy();
  expect(refreshCookie.httpOnly).toBeTruthy();
}

module.exports = {
  expectAuthenticatedDashboard,
  expectLoginPage,
  expectNoPersistedAuthToken,
  expectRefreshCookie,
  getE2ECredentials,
  loginByUi,
};
