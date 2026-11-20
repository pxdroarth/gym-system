// L04 · Estorno de pagamento do aluno (sublote A, decisoes de 20/11/2026).
// Roda sobre o SQLite descartavel do runner (smoke-sqlite.ps1 -Playwright).
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

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Aluno ativo com uma mensalidade de R$ 100 vencendo hoje.
async function alunoComMensalidade(request, owner, nome) {
  seq += 1;
  const planos = await (await request.get(`${api}/planos`, { headers: owner.headers() })).json();
  const plano = (planos.data || planos).find((p) => p.ativo !== 0) || (planos.data || planos)[0];
  let response = await request.post(`${api}/alunos`, {
    headers: owner.headers(),
    data: { nome: `E2E ${nome} ${seq} ${run}`, data_nascimento: '1990-01-01', plano_id: plano.id, dia_vencimento: 10, status: 'ativo' },
  });
  expect(response.status()).toBeLessThan(300);
  const alunoBody = await response.json();
  const aluno = alunoBody.data || alunoBody;
  response = await request.post(`${api}/mensalidades`, {
    headers: owner.headers(),
    data: { aluno_id: aluno.id, plano_id: plano.id, vencimento: hojeLocal(), valor_cobrado: 100 },
  });
  expect(response.status()).toBeLessThan(300);
  const mBody = await response.json();
  return { aluno, mensalidade: mBody.data || mBody };
}

async function pagarPorApi(request, sessao, mensalidadeId, valor, forma) {
  const response = await request.post(`${api}/pagamentos`, {
    headers: sessao.headers(),
    data: { mensalidade_id: mensalidadeId, valor_pago: valor, ...(forma ? { forma_pagamento: forma } : {}) },
  });
  expect(response.status()).toBeLessThan(300);
  const body = await response.json();
  return body.pagamento || body.data || body;
}

async function pagamentosDoAluno(request, sessao, alunoId) {
  return (await request.get(`${api}/pagamentos/aluno/${alunoId}`, { headers: sessao.headers() })).json();
}

async function estornosDo(request, sessao, pagamentoId) {
  return (await request.get(`${api}/pagamentos/estornos?pagamento_id=${pagamentoId}`, { headers: sessao.headers() })).json();
}

async function abrirMensalidades(page, alunoId) {
  await page.goto(`/alunos/${alunoId}`);
  await page.getByRole('tab', { name: 'Mensalidades' }).or(page.getByRole('button', { name: 'Mensalidades', exact: true })).first().click();
}

async function abrirPagamentos(page, alunoId, mensalidadeId) {
  await abrirMensalidades(page, alunoId);
  await page.getByTestId(`pagamentos-mensalidade-${mensalidadeId}`).click();
  const dialog = page.getByRole('dialog', { name: /Pagamentos da mensalidade|Estorno do pagamento/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Estorno de pagamento do aluno', () => {
  test.skip(process.env.E2E_DISPOSABLE_SQLITE !== 'true', 'Use smoke-sqlite.ps1 -Playwright para criar a base descartável.');

  let owner; let recepcao; let gestor;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    owner = await apiLogin(request, 'owner');
    recepcao = await apiLogin(request, 'recepcao');
    gestor = await apiLogin(request, 'gestor');
    await request.dispose();
  });

  test('recepção registra o meio do recebimento no perfil e solicita o estorno com motivo', async ({ page, request }) => {
    const { aluno, mensalidade } = await alunoComMensalidade(request, owner, 'Pix');
    await signIn(page, 'recepcao');
    await abrirMensalidades(page, aluno.id);
    const linha = page.locator('tr', { has: page.getByTestId(`pagar-mensalidade-${mensalidade.id}`) });
    await linha.getByLabel('Meio do recebimento').selectOption('pix');
    await linha.getByLabel('Valor do recebimento').fill('40');
    const pagar = watchResponse(page, 'POST', '/pagamentos');
    await page.getByTestId(`pagar-mensalidade-${mensalidade.id}`).click();
    const resposta = await pagar;
    expect(resposta.status()).toBeLessThan(300);
    expect(resposta.request().postDataJSON()).toMatchObject({ mensalidade_id: mensalidade.id, valor_pago: 40, forma_pagamento: 'pix' });

    const dialog = await abrirPagamentos(page, aluno.id, mensalidade.id);
    const tabela = dialog.getByRole('table', { name: 'Pagamentos da mensalidade' });
    await expect(tabela).toContainText('Pix');
    await expect(tabela).toContainText('R$ 40,00');
    await tabela.getByRole('button', { name: 'Estorno', exact: true }).click();
    await expect(dialog.getByTestId('meio-original')).toHaveText('Pix');
    await dialog.getByRole('button', { name: 'Solicitar estorno' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Informe o motivo do estorno.');
    await dialog.getByLabel('Motivo do estorno').fill('Cobrado em duplicidade');
    const solicitar = watchResponse(page, 'POST', /^\/pagamentos\/\d+\/estornos$/);
    await dialog.getByRole('button', { name: 'Solicitar estorno' }).click();
    expect((await solicitar).status()).toBe(201);
    // A recepcao nao aprova; ela pode apenas registrar a autorizacao que o dono ou admin der fora do sistema.
    await expect(dialog.getByRole('list', { name: 'Pedidos de estorno' })).toContainText('Cobrado em duplicidade');
    await expect(dialog.getByRole('button', { name: 'Aprovar estorno' })).toHaveCount(0);
    await expect(dialog.getByRole('form', { name: 'Registrar autorização externa' })).toBeVisible();
    await page.screenshot({ path: 'tests/e2e/results/l04a-estorno-pagamento-solicitado.png' });

    const [pagamento] = await pagamentosDoAluno(request, recepcao, aluno.id);
    expect(pagamento.forma_pagamento).toBe('pix');
    const [pedido] = await estornosDo(request, recepcao, pagamento.id);
    expect(pedido.status).toBe('solicitada');
    expect(pedido.meio_original).toBe('pix');
  });

  test('recepção registra a autorização do dono recebida por WhatsApp', async ({ page, request }) => {
    const { aluno, mensalidade } = await alunoComMensalidade(request, owner, 'Externa');
    const pagamento = await pagarPorApi(request, recepcao, mensalidade.id, 100, 'dinheiro');
    const pedido = await request.post(`${api}/pagamentos/${pagamento.id}/estornos`, { headers: gestor.headers(), data: { motivo: 'Aluno cancelou no mesmo dia' } });
    expect(pedido.status()).toBe(201);

    await signIn(page, 'recepcao');
    const dialog = await abrirPagamentos(page, aluno.id, mensalidade.id);
    await dialog.getByRole('button', { name: 'Estorno', exact: true }).click();
    const form = dialog.getByRole('form', { name: 'Registrar autorização externa' });
    await expect(form).toBeVisible();
    await form.getByLabel('Quem autorizou').selectOption(String(owner.user.id));
    await form.getByLabel('Referência da mensagem ou e-mail').fill('WhatsApp do dono às 10h');
    const registrar = watchResponse(page, 'POST', /\/autorizacao-externa$/);
    await form.getByRole('button', { name: 'Registrar autorização externa' }).click();
    expect((await registrar).status()).toBe(200);
    await expect(dialog.getByText('Autorizado. Aguardando execução', { exact: false })).toBeVisible();

    const [estorno] = await estornosDo(request, recepcao, pagamento.id);
    expect(estorno.status).toBe('aprovada');
    expect(estorno.autorizacao_canal).toBe('whatsapp');
    expect(String(estorno.aprovado_por)).toBe(String(owner.user.id));
  });

  test('financeiro executa pela fila, devolve em outro meio com motivo e comprovante e o acesso é reavaliado', async ({ page, request }) => {
    const { aluno, mensalidade } = await alunoComMensalidade(request, owner, 'Fila');
    const pagamento = await pagarPorApi(request, recepcao, mensalidade.id, 100, 'dinheiro');
    const pedido = await (await request.post(`${api}/pagamentos/${pagamento.id}/estornos`, { headers: recepcao.headers(), data: { motivo: 'Pagamento lançado no aluno errado' } })).json();
    expect((await request.post(`${api}/pagamentos/estornos/${pedido.id}/aprovar`, { headers: owner.headers() })).status()).toBe(200);

    await signIn(page, 'financeiro');
    await page.goto('/financeiro/estornos-pagamento');
    await page.getByRole('button', { name: 'Aguardando execução', exact: true }).click();
    const row = page.locator(`tr[data-estorno-id="${pedido.id}"]`);
    await expect(row).toContainText(aluno.nome);
    await expect(row).toContainText('Dinheiro');
    await row.getByRole('button', { name: 'Abrir' }).click();
    const dialog = page.getByRole('dialog', { name: `Estorno do pagamento #${pagamento.id}` });
    const form = dialog.getByRole('form', { name: 'Executar estorno' });
    await expect(form.getByLabel('Meio 1')).toHaveValue('dinheiro');
    await expect(form.getByLabel('Valor 1 (R$)')).toHaveValue('100,00');
    await form.getByLabel('Meio 1').selectOption('pix');
    await expect(form.getByTestId('aviso-meio-alternativo')).toBeVisible();
    await form.getByLabel('Confirmo que a devolução ao aluno foi feita nesses valores').check();
    await form.getByRole('button', { name: 'Executar estorno' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Informe o motivo da devolução em outro meio.');
    await form.getByLabel('Motivo da devolução em outro meio').fill('Caixa sem troco, aluno aceitou Pix');
    await form.getByLabel('Referência do comprovante').fill('Pix E2E 123');
    const executar = watchResponse(page, 'POST', /\/estornos\/\d+\/executar$/);
    await form.getByRole('button', { name: 'Executar estorno' }).click();
    const resposta = await executar;
    expect(resposta.status()).toBe(200);
    expect(resposta.request().postDataJSON()).toMatchObject({ devolucoes: [{ meio: 'pix', valor: 100 }], devolucao_confirmada: true });
    await expect(dialog.getByTestId('acesso-reavaliado')).toContainText('entrada bloqueada');
    await expect(dialog.getByTestId('devolucao-pagamento')).toContainText('Pix R$ 100,00');
    await expect(dialog.getByTestId('devolucao-pagamento')).toContainText('Outro meio');
    await page.screenshot({ path: 'tests/e2e/results/l04a-estorno-pagamento-executado.png' });

    const [estorno] = await estornosDo(request, owner, pagamento.id);
    expect(estorno.status).toBe('executada');
    expect(estorno.devolucao_meio_alternativo).toBe(1);
    expect(estorno.devolucoes).toEqual([expect.objectContaining({ meio: 'pix', valor: 100 })]);
    const [pg] = (await pagamentosDoAluno(request, owner, aluno.id)).filter((p) => p.id === pagamento.id);
    expect(pg.estornado_em).toBeTruthy();
  });

  test('pagamento sem meio registrado aparece como "Meio não registrado" e o dono não aprova o próprio pedido', async ({ page, request }) => {
    const { aluno, mensalidade } = await alunoComMensalidade(request, owner, 'Legado');
    const pagamento = await pagarPorApi(request, recepcao, mensalidade.id, 30);
    expect((await request.post(`${api}/pagamentos/${pagamento.id}/estornos`, { headers: owner.headers(), data: { motivo: 'Teste de autoaprovação' } })).status()).toBe(201);

    await signIn(page, 'owner');
    const dialog = await abrirPagamentos(page, aluno.id, mensalidade.id);
    await expect(dialog.getByRole('table', { name: 'Pagamentos da mensalidade' })).toContainText('Meio não registrado');
    await dialog.getByRole('button', { name: 'Estorno', exact: true }).click();
    await expect(dialog.getByText('Você solicitou este estorno e não pode aprová-lo.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Aprovar estorno' })).toBeDisabled();
  });

  test('no celular o dono executa pelo perfil do aluno devolvendo pelo meio original', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { aluno, mensalidade } = await alunoComMensalidade(request, owner, 'Celular');
    const p1 = await pagarPorApi(request, recepcao, mensalidade.id, 60, 'cartao_debito');
    await pagarPorApi(request, recepcao, mensalidade.id, 40, 'pix');
    const pedido = await (await request.post(`${api}/pagamentos/${p1.id}/estornos`, { headers: recepcao.headers(), data: { motivo: 'Débito passado em duplicidade' } })).json();
    const admin = await apiLogin(request, 'admin.academia');
    expect((await request.post(`${api}/pagamentos/estornos/${pedido.id}/aprovar`, { headers: admin.headers() })).status()).toBe(200);

    await signIn(page, 'owner');
    const dialog = await abrirPagamentos(page, aluno.id, mensalidade.id);
    await dialog.locator(`tr[data-pagamento-id="${p1.id}"]`).getByRole('button', { name: 'Estorno', exact: true }).click();
    const form = dialog.getByRole('form', { name: 'Executar estorno' });
    await expect(form.getByLabel('Meio 1')).toHaveValue('cartao_debito');
    await expect(form.getByLabel('Valor 1 (R$)')).toHaveValue('60,00');
    await expect(form.getByTestId('aviso-meio-alternativo')).toHaveCount(0);
    await form.getByLabel('Confirmo que a devolução ao aluno foi feita nesses valores').check();
    const larguras = await dialog.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(larguras.scroll).toBeLessThanOrEqual(larguras.client + 1);
    await page.screenshot({ path: 'tests/e2e/results/l04a-estorno-pagamento-celular.png' });
    const executar = watchResponse(page, 'POST', /\/estornos\/\d+\/executar$/);
    await form.getByRole('button', { name: 'Executar estorno' }).click();
    expect((await executar).status()).toBe(200);
    // Restam R$ 40 pagos de R$ 100: a mensalidade volta a parcial.
    await expect(dialog.getByTestId('acesso-reavaliado')).toContainText('Mensalidade Parcial');
    await expect(dialog.getByTestId('devolucao-pagamento')).toContainText('Cartão de débito R$ 60,00');
  });
});
