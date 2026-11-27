// L04 · Pendências por estorno e "Contatar aluno" (sublote B, decisões de 20/11 e 26/11/2026).
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

function hojeLocal(deslocamento = 0) {
  const d = new Date(Date.now() + deslocamento * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

const corpo = async (response) => { const b = await response.json(); return b.data || b; };

test.describe('Pendências por estorno e contato com o aluno', () => {
  test.skip(process.env.E2E_DISPOSABLE_SQLITE !== 'true', 'Use smoke-sqlite.ps1 -Playwright para criar a base descartável.');

  let owner; let admin; let recepcao; let financeiro; let mensal; let trimestral;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    owner = await apiLogin(request, 'owner');
    admin = await apiLogin(request, 'admin.academia');
    recepcao = await apiLogin(request, 'recepcao');
    financeiro = await apiLogin(request, 'financeiro');
    const planos = await corpo(await request.get(`${api}/planos`, { headers: owner.headers() }));
    mensal = planos.find((p) => Number(p.duracao_em_dias) === 30 && !Number(p.compartilhado));
    trimestral = planos.find((p) => Number(p.duracao_em_dias) === 90);
    await request.dispose();
  });

  // Aluno com mensalidade paga em duas partes e a primeira estornada.
  async function pendencia(request, { pacote = false, nome = 'Mensal', email } = {}) {
    seq += 1;
    const plano = pacote ? trimestral : mensal;
    let r = await request.post(`${api}/alunos`, {
      headers: owner.headers(),
      data: { nome: `E2E B ${nome} ${seq} ${run}`, data_nascimento: '1990-01-01', plano_id: plano.id, dia_vencimento: 10, status: 'ativo', telefone: '(85) 98888-7777', ...(email ? { email } : {}) },
    });
    expect(r.status()).toBe(201);
    const aluno = await corpo(r);
    r = await request.post(`${api}/mensalidades`, {
      headers: owner.headers(),
      data: { aluno_id: aluno.id, plano_id: plano.id, vencimento: hojeLocal(), ...(pacote ? { data_inicio: hojeLocal(-10) } : {}), valor_cobrado: pacote ? 300 : 100 },
    });
    expect(r.status()).toBe(201);
    const mensalidade = await corpo(r);
    const pagamentos = [];
    for (const valor of pacote ? [100, 200] : [50, 50]) {
      r = await request.post(`${api}/pagamentos`, { headers: recepcao.headers(), data: { mensalidade_id: mensalidade.id, valor_pago: valor, forma_pagamento: 'pix' } });
      expect(r.status()).toBe(201);
      const b = await r.json();
      pagamentos.push(b.pagamento || b);
    }
    const alvo = pagamentos[0];
    const pedido = await (await request.post(`${api}/pagamentos/${alvo.id}/estornos`, { headers: recepcao.headers(), data: { motivo: 'E2E sublote B' } })).json();
    expect((await request.post(`${api}/pagamentos/estornos/${pedido.id}/aprovar`, { headers: admin.headers() })).status()).toBe(200);
    expect((await request.post(`${api}/pagamentos/estornos/${pedido.id}/executar`, {
      headers: financeiro.headers(), data: { devolucoes: [{ meio: 'pix', valor: Number(alvo.valor_pago) }], devolucao_confirmada: true },
    })).status()).toBe(200);
    return { aluno, mensalidade };
  }

  test('recepção vê o aviso ao entrar, abre o Dashboard e registra o contato pelo WhatsApp', async ({ page, request }) => {
    const { aluno, mensalidade } = await pendencia(request, { nome: 'Aviso' });
    await signIn(page, 'recepcao');
    const aviso = page.getByTestId('aviso-pendencias');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('pendência');
    await expect(aviso).toContainText('acesso bloqueado');
    await page.screenshot({ path: 'tests/e2e/results/l04b-aviso-pendencias.png' });

    const painel = page.getByRole('table', { name: 'Pendências para contatar' });
    const linha = painel.locator(`tr[data-pendencia-mensalidade="${mensalidade.id}"]`);
    await expect(linha).toContainText(aluno.nome);
    await expect(linha).toContainText('R$ 50,00');
    await expect(linha).toContainText('Bloqueado');
    await expect(linha).toContainText('Nenhum contato');
    await linha.getByRole('button', { name: 'Contatar aluno' }).click();

    const dialog = page.getByRole('dialog', { name: `Contatar ${aluno.nome}` });
    const whatsapp = dialog.getByTestId('contato-whatsapp');
    await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/5585988887777\?text=/);
    await expect(whatsapp).toHaveAttribute('target', '_blank');
    await expect(dialog.getByText('Sem e-mail cadastrado.')).toBeVisible();
    await expect(dialog.getByLabel('Canal usado')).toHaveValue('whatsapp');
    await dialog.getByLabel('Observação (opcional)').fill('Vai pagar na sexta');
    const registrar = watchResponse(page, 'POST', '/pendencias/contatos');
    await dialog.getByRole('button', { name: 'Registrar contato' }).click();
    const resposta = await registrar;
    expect(resposta.status()).toBe(201);
    expect(resposta.request().postDataJSON()).toMatchObject({ aluno_id: aluno.id, mensalidade_id: mensalidade.id, canal: 'whatsapp', observacao: 'Vai pagar na sexta' });
    await expect(dialog).toBeHidden();
    await expect(linha).toContainText('WhatsApp');
    await expect(linha).toContainText('Recepcao Matriz');
  });

  test('perfil do pacote mostra a cobertura proporcional, o teste de acesso libera com pendência e a quitação encerra', async ({ page, request }) => {
    const { aluno, mensalidade } = await pendencia(request, { pacote: true, nome: 'Pacote', email: 'pacote.e2e@exemplo.com' });
    await signIn(page, 'gestor');
    await page.goto(`/alunos/${aluno.id}`);
    const banner = page.getByTestId(`pendencia-aluno-${mensalidade.id}`);
    await expect(banner).toContainText('pacote de 3 meses passa a cobrir 2 meses');
    await expect(banner).toContainText('Acesso liberado até');
    await expect(page.getByText('pacote.e2e@exemplo.com').first()).toBeVisible();

    const teste = watchResponse(page, 'POST', '/acessos/mock-hikvision');
    await page.getByRole('button', { name: 'Testar acesso' }).click();
    const avaliacao = (await (await teste).json()).avaliacao;
    expect(avaliacao).toMatchObject({ ok: true, status: 'liberado_com_restricao', motivo: 'cobertura_proporcional' });
    await expect(page.getByText('Acesso liberado com pendência', { exact: false })).toBeVisible();

    await banner.getByRole('button', { name: 'Contatar aluno' }).click();
    const dialog = page.getByRole('dialog', { name: `Contatar ${aluno.nome}` });
    await expect(dialog.getByTestId('contato-email')).toHaveAttribute('href', /^mailto:pacote\.e2e@exemplo\.com\?subject=/);
    await dialog.getByTestId('contato-email').evaluate((a) => a.removeAttribute('href'));
    await dialog.getByTestId('contato-email').click();
    await expect(dialog.getByLabel('Canal usado')).toHaveValue('email');
    await dialog.getByRole('button', { name: 'Registrar contato' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Contatos registrados (1)')).toBeVisible();

    const quitar = await request.post(`${api}/pagamentos`, { headers: recepcao.headers(), data: { mensalidade_id: mensalidade.id, valor_pago: 100, forma_pagamento: 'dinheiro' } });
    expect(quitar.status()).toBe(201);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Perfil do Aluno' })).toBeVisible();
    await expect(page.getByTestId(`pendencia-aluno-${mensalidade.id}`)).toHaveCount(0);
    await expect(page.getByText('Contatos registrados (1)')).toBeVisible();
  });

  test('e-mail opcional no cadastro: vazio salva, inválido é recusado e válido aparece no perfil', async ({ page, request }) => {
    seq += 1;
    const criado = await request.post(`${api}/alunos`, {
      headers: owner.headers(),
      data: { nome: `E2E B Email ${seq} ${run}`, data_nascimento: '1990-01-01', plano_id: mensal.id, dia_vencimento: 10, status: 'ativo' },
    });
    expect(criado.status()).toBe(201);
    const aluno = await corpo(criado);
    expect(aluno.email).toBeNull();

    await signIn(page, 'recepcao');
    await page.goto(`/alunos/editar/${aluno.id}`);
    // Espera o formulario carregar o aluno: a carga sobrescreveria o que fosse digitado antes.
    await expect(page.locator('input[name="nome"]')).toHaveValue(aluno.nome);
    const campo = page.getByLabel('E-mail (opcional):');
    await expect(campo).toHaveValue('');
    await campo.fill('Novo.Aluno@Exemplo.com');
    const salvar = watchResponse(page, 'PUT', `/alunos/${aluno.id}`);
    await page.getByRole('button', { name: 'Salvar' }).click();
    const resposta = await salvar;
    expect(resposta.status()).toBe(200);
    expect(resposta.request().postDataJSON().email).toBe('Novo.Aluno@Exemplo.com');
    await page.goto(`/alunos/${aluno.id}`);
    await expect(page.getByText('novo.aluno@exemplo.com').first()).toBeVisible();

    const invalido = await request.put(`${api}/alunos/${aluno.id}`, {
      headers: owner.headers(),
      data: { nome: aluno.nome, data_nascimento: '1990-01-01', plano_id: mensal.id, dia_vencimento: 10, email: 'sem-arroba' },
    });
    expect(invalido.status()).toBe(400);
    expect((await invalido.json()).code).toBe('ALUNO_EMAIL_INVALIDO');
  });

  test('no celular o painel de pendências e o modal de contato cabem na tela', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { aluno, mensalidade } = await pendencia(request, { nome: 'Celular' });
    await signIn(page, 'financeiro');
    const painel = page.locator('#pendencias');
    await painel.scrollIntoViewIfNeeded();
    const linha = painel.locator(`tr[data-pendencia-mensalidade="${mensalidade.id}"]`);
    await expect(linha).toContainText(aluno.nome);
    const larguraPagina = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(larguraPagina.scroll).toBeLessThanOrEqual(larguraPagina.client + 1);
    await linha.getByRole('button', { name: 'Contatar aluno' }).click();
    const dialog = page.getByRole('dialog', { name: `Contatar ${aluno.nome}` });
    await expect(dialog).toBeVisible();
    const larguras = await dialog.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(larguras.scroll).toBeLessThanOrEqual(larguras.client + 1);
    await page.screenshot({ path: 'tests/e2e/results/l04b-contatar-celular.png' });
  });
});
