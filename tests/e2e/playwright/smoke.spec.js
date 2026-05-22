const { test, expect } = require('@playwright/test');

test.describe('sanity', () => {
  test('renderiza a tela de login sem sessao previa', async ({ page }) => {
    await page.goto('/login');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Academia SA' })).toBeVisible();
    await expect(page.getByLabel('Login ou email')).toBeVisible();
    await expect(page.getByLabel('Senha')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });
});
