// L04 · Venda com pagamento dividido e devolucao por meio (decisoes de 16/11/2026).
// Roda sobre o SQLite descartavel do runner (smoke-sqlite.ps1 -Playwright).
const { test, expect } = require('@playwright/test');
const { loginByUi } = require('../fixtures/auth');

const api = process.env.PLAYWRIGHT_API_URL;
const password = process.env.SEED_DEV_PASSWORD;
const run = Date.now().toString(36);

function watchResponse(page, method, path) {
  return page.waitForResponse((response) =>
    response.request().method() === method && new URL(response.url()).pathname === path
  );
}

async function signIn(page, login) {
  await page.goto('/login');
  const response = watchResponse(page, 'POST', '/auth/login');
  await loginByUi(page, { login, password });
  expect((await response).ok()).toBe(true);
  await expect(page).toHaveURL(/\/dashboard$/);
}

// Sessoes de API para preparar e conferir os dados.
async function apiLogin(request, login) {
  const response = await request.post(`${api}/auth/login`, { data: { login, senha: password } });
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  const matriz = data.usuario.allowedUnits.find((unit) => unit.codigo === 'matriz');
  const filial = data.usuario.allowedUnits.find((unit) => unit.codigo === 'filial');
  const headers = (unit = matriz) => ({ Authorization: `Bearer ${data.token}`, 'X-Unit-Id': String(unit.id) });
  return { token: data.token, user: data.usuario, matriz, filial, headers };
}

async function criarProduto(request, owner, nome, preco = 5, estoque = 20) {
  const response = await request.post(`${api}/produtos`, {
    headers: owner.headers(),
    multipart: { nome: `${nome} ${run}`, preco: String(preco), estoque: String(estoque) },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function estoque(request, sessao, produtoId) {
  const response = await request.get(`${api}/produtos`, { headers: sessao.headers() });
  return (await response.json()).find((item) => item.id === produtoId).estoque;
}

async function venderPorApi(request, sessao, produtoId, pagamentos, extra = {}) {
  return request.post(`${api}/vendas-produtos`, {
    headers: { ...sessao.headers(), ...(extra.key ? { 'Idempotency-Key': extra.key } : {}) },
    data: { produto_id: produtoId, quantidade: 1, pagamentos, ...(extra.body || {}) },
  });
}

async function vendaAprovada(request, { recepcao, gestor, produtoId }) {
  const venda = await (await venderPorApi(request, recepcao, produtoId, [{ meio: 'dinheiro', valor: 2 }, { meio: 'pix', valor: 3 }])).json();
  const pedido = await request.post(`${api}/vendas-produtos/${venda.id}/estornos`, { headers: recepcao.headers(), data: { motivo: 'Cliente devolveu lacrado' } });
  expect(pedido.status()).toBe(201);
  const estorno = await pedido.json();
  const aprovado = await request.post(`${api}/vendas-produtos/estornos/${estorno.id}/aprovar`, { headers: gestor.headers() });
  expect(aprovado.status()).toBe(200);
  return { venda, estorno };
}

async function conferenciaDaVenda(request, sessao, vendaId) {
  const response = await request.get(`${api}/vendas-produtos/${vendaId}`, { headers: sessao.headers() });
  expect(response.ok()).toBe(true);
  return response.json();
}

async function abrirEstorno(page, vendaId) {
  await page.getByRole('link', { name: 'Vendas', exact: true }).click();
  const row = page.locator(`tr[data-venda-id="${vendaId}"]`);
  await row.getByRole('button', { name: 'Estorno', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Estorno da venda #${vendaId}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Venda com pagamento dividido e devolução por meio', () => {
  test.skip(process.env.E2E_DISPOSABLE_SQLITE !== 'true', 'Use smoke-sqlite.ps1 -Playwright para criar a base descartável.');

  let owner; let recepcao; let gestor; let produto;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    owner = await apiLogin(request, 'owner');
    recepcao = await apiLogin(request, 'recepcao');
    gestor = await apiLogin(request, 'gestor');
    produto = await criarProduto(request, owner, 'Pre-treino dose E2E', 5, 40);
    await request.dispose();
  });

  test('recepção divide R$ 5 em R$ 2 no dinheiro e R$ 3 no Pix e a venda aparece mesmo com filtro histórico', async ({ page, request }) => {
    await signIn(page, 'recepcao');
    await page.getByRole('link', { name: 'Vendas', exact: true }).click();
    await page.getByLabel('Data inicial').fill('2025-01-01');
    await page.getByLabel('Data final').fill('2025-01-01');
    await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
    await expect(page.getByText('Nenhuma venda encontrada.', { exact: true })).toBeVisible();

    const antes = await estoque(request, recepcao, produto.id);
    await page.getByRole('button', { name: 'Nova venda', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar Venda' });
    await dialog.getByLabel('Produto').selectOption(String(produto.id));
    await dialog.getByLabel('Quantidade').fill('1');
    await expect(dialog.getByText('R$ 5,00').first()).toBeVisible();
    await dialog.getByLabel('Meio 1').selectOption('dinheiro');
    await dialog.getByLabel('Valor 1 (R$)').fill('2');
    await expect(dialog.getByTestId('venda-saldo')).toHaveText('Faltam R$ 3,00');
    await page.screenshot({ path: 'tests/e2e/results/l04-venda-saldo-restante.png' });
    const registrar = dialog.getByRole('button', { name: 'Registrar Venda', exact: true });
    await expect(registrar).toBeDisabled();

    await dialog.getByRole('button', { name: 'Adicionar meio' }).click();
    await dialog.getByLabel('Meio 2').selectOption('pix');
    await dialog.getByLabel('Valor 2 (R$)').fill('3');
    await expect(dialog.getByTestId('venda-saldo')).toHaveText('Quitado');
    await expect(registrar).toBeEnabled();
    const pending = watchResponse(page, 'POST', '/vendas-produtos');
    await registrar.click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const enviado = response.request().postDataJSON();
    expect(enviado.preco_unitario).toBeUndefined();
    expect(enviado.pagamentos).toEqual([{ meio: 'dinheiro', valor: 2 }, { meio: 'pix', valor: 3 }]);
    const venda = await response.json();
    await expect(dialog).toBeHidden();

    const row = page.locator(`tr[data-venda-id="${venda.id}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('venda-meios')).toHaveText('Dinheiro R$ 2,00 · Pix R$ 3,00');
    await expect(page.getByLabel('Data inicial')).toHaveValue('');
    expect(await estoque(request, recepcao, produto.id)).toBe(antes - 1);
    const detalhe = await conferenciaDaVenda(request, recepcao, venda.id);
    expect(detalhe.valor_total).toBe(5);
    expect(detalhe.meios.map((m) => [m.meio, m.recebido])).toEqual([['dinheiro', 2], ['pix', 3]]);
  });

  test('API recusa saldo restante e preço manual sem gravar e o reenvio devolve a venda original', async ({ request }) => {
    const antes = await estoque(request, recepcao, produto.id);
    const conferenciaAntes = await (await request.get(`${api}/vendas-produtos/conferencia-meios`, { headers: recepcao.headers() })).json();

    let response = await venderPorApi(request, recepcao, produto.id, [{ meio: 'dinheiro', valor: 2 }]);
    expect(response.status()).toBe(422);
    const incompleto = await response.json();
    expect(incompleto.code).toBe('PAGAMENTO_INCOMPLETO');
    expect(incompleto.details.restante).toBe(3);

    response = await venderPorApi(request, recepcao, produto.id, [{ meio: 'dinheiro', valor: 1 }], { body: { preco_unitario: 1 } });
    expect(response.status()).toBe(422);
    expect((await response.json()).code).toBe('PRECO_MANUAL_NAO_PERMITIDO');
    expect(await estoque(request, recepcao, produto.id)).toBe(antes);

    const key = `e2e-reenvio-${run}`;
    const pagamentos = [{ meio: 'dinheiro', valor: 2 }, { meio: 'cartao_debito', valor: 3 }];
    const primeira = await venderPorApi(request, recepcao, produto.id, pagamentos, { key });
    const reenvio = await venderPorApi(request, recepcao, produto.id, pagamentos, { key });
    expect(primeira.status()).toBe(201);
    expect(reenvio.status()).toBe(200);
    expect(reenvio.headers()['idempotent-replayed']).toBe('true');
    const vendaOriginal = await primeira.json();
    expect((await reenvio.json()).id).toBe(vendaOriginal.id);
    expect(await estoque(request, recepcao, produto.id)).toBe(antes - 1);
    expect((await conferenciaDaVenda(request, recepcao, vendaOriginal.id)).recebimentos).toHaveLength(2);
    const conferenciaDepois = await (await request.get(`${api}/vendas-produtos/conferencia-meios`, { headers: recepcao.headers() })).json();
    const liquido = (c, meio) => c.meios.find((m) => m.meio === meio).liquido;
    expect(Math.round((liquido(conferenciaDepois, 'dinheiro') - liquido(conferenciaAntes, 'dinheiro')) * 100)).toBe(200);
    expect(Math.round((liquido(conferenciaDepois, 'cartao_debito') - liquido(conferenciaAntes, 'cartao_debito')) * 100)).toBe(300);
  });

  test('recepção devolve pelos mesmos meios da venda', async ({ page, request }) => {
    const { venda } = await vendaAprovada(request, { recepcao, gestor, produtoId: produto.id });
    const antes = await estoque(request, recepcao, produto.id);
    await signIn(page, 'recepcao');
    const dialog = await abrirEstorno(page, venda.id);
    const meiosVenda = dialog.getByRole('table', { name: 'Meios e valores da venda' });
    await expect(meiosVenda.locator('tr[data-meio="dinheiro"]')).toContainText('R$ 2,00');
    await expect(meiosVenda.locator('tr[data-meio="pix"]')).toContainText('R$ 3,00');
    await expect(dialog.getByLabel('Meio 1')).toHaveValue('dinheiro');
    await expect(dialog.getByLabel('Valor 1 (R$)')).toHaveValue('2,00');
    await expect(dialog.getByLabel('Meio 2')).toHaveValue('pix');
    await expect(dialog.getByLabel('Valor 2 (R$)')).toHaveValue('3,00');
    await expect(dialog.getByTestId('devolucao-saldo')).toHaveText('Quitado');
    await dialog.getByLabel(/Unidades recebidas em condição de venda/).fill('1');
    await dialog.getByRole('button', { name: 'Executar estorno' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Confirme que a devolução ao cliente foi feita');
    await dialog.getByLabel('Confirmo que a devolução ao cliente foi feita nesses valores').check();
    const executar = page.waitForResponse((r) => r.request().method() === 'POST' && /\/estornos\/\d+\/executar$/.test(new URL(r.url()).pathname));
    await dialog.getByRole('button', { name: 'Executar estorno' }).click();
    expect((await executar).status()).toBe(200);
    const conferencia = dialog.getByRole('table', { name: 'Conferência por meio (venda estornada)' });
    await expect(conferencia.locator('tr[data-meio="dinheiro"] td').last()).toHaveText('R$ 0,00');
    await expect(conferencia.locator('tr[data-meio="pix"] td').last()).toHaveText('R$ 0,00');
    await expect(conferencia.locator('tr[data-meio="total"] td').last()).toHaveText('R$ 0,00');
    await expect(dialog.getByTestId('devolucao-registrada')).toContainText('Dinheiro R$ 2,00 · Pix R$ 3,00');
    expect(await estoque(request, recepcao, produto.id)).toBe(antes + 1);
    const detalhe = await conferenciaDaVenda(request, recepcao, venda.id);
    expect(detalhe.reversao_controlada_id).toBeTruthy();
    expect(detalhe.total_liquido).toBe(0);
  });

  test('no celular, recepção devolve R$ 5 no Pix com motivo e comprovante e a conferência fecha em R$ 0', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { venda, estorno } = await vendaAprovada(request, { recepcao, gestor, produtoId: produto.id });
    const antes = await estoque(request, recepcao, produto.id);
    await signIn(page, 'recepcao');
    const menu = page.getByRole('button', { name: /menu/i });
    if (await menu.count() && !(await page.getByRole('link', { name: 'Vendas', exact: true }).isVisible())) await menu.first().click();
    const dialog = await abrirEstorno(page, venda.id);
    await dialog.getByRole('button', { name: 'Remover linha 1' }).click();
    await expect(dialog.getByLabel('Meio 1')).toHaveValue('pix');
    await dialog.getByLabel('Valor 1 (R$)').fill('5');
    await expect(dialog.getByTestId('aviso-meio-alternativo')).toBeVisible();
    await dialog.getByLabel(/Unidades recebidas em condição de venda/).fill('0');
    await dialog.getByLabel('Confirmo que a devolução ao cliente foi feita nesses valores').check();
    await dialog.getByRole('button', { name: 'Executar estorno' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Informe o motivo da devolução em outro meio');
    await dialog.getByLabel('Motivo da devolução em outro meio').fill('Faltou dinheiro no caixa');
    await dialog.getByLabel('Referência do comprovante').fill(`Pix E2E ${run}`);
    const executar = page.waitForResponse((r) => r.request().method() === 'POST' && /\/estornos\/\d+\/executar$/.test(new URL(r.url()).pathname));
    await dialog.getByRole('button', { name: 'Executar estorno' }).click();
    const resposta = await executar;
    expect(resposta.status()).toBe(200);
    expect(resposta.request().postDataJSON().devolucoes).toEqual([{ meio: 'pix', valor: 5 }]);
    const conferencia = dialog.getByRole('table', { name: 'Conferência por meio (venda estornada)' });
    await expect(conferencia.locator('tr[data-meio="dinheiro"] td').last()).toHaveText('R$ 2,00');
    await expect(conferencia.locator('tr[data-meio="pix"] td').last()).toHaveText('-R$ 2,00');
    await expect(conferencia.locator('tr[data-meio="total"] td').last()).toHaveText('R$ 0,00');
    await expect(dialog.getByTestId('devolucao-registrada')).toContainText('Faltou dinheiro no caixa');
    await expect(dialog.getByTestId('devolucao-registrada')).toContainText(`Pix E2E ${run}`);
    await page.screenshot({ path: 'tests/e2e/results/l04-devolucao-outro-meio-celular.png', fullPage: false });

    expect(await estoque(request, recepcao, produto.id)).toBe(antes);
    const detalhe = await conferenciaDaVenda(request, recepcao, venda.id);
    expect(detalhe.meios.map((m) => [m.meio, m.liquido])).toEqual([['dinheiro', 2], ['pix', -2]]);
    expect(detalhe.total_liquido).toBe(0);
    const [pedido] = await (await request.get(`${api}/vendas-produtos/estornos?venda_id=${venda.id}`, { headers: recepcao.headers() })).json();
    expect(pedido.id).toBe(estorno.id);
    expect(pedido.devolucao_meio_alternativo).toBe(1);
    expect(pedido.devolucao_motivo).toBe('Faltou dinheiro no caixa');
    expect(pedido.devolucao_comprovante).toBe(`Pix E2E ${run}`);
    expect(pedido.aprovado_por).toBe(String(gestor.user.id));
    expect(pedido.executado_por).toBe(String(recepcao.user.id));
  });

  test('venda anterior ao pagamento por meio aparece sem meio atribuído', async ({ page, request }) => {
    const { vendas } = await (await request.get(`${api}/vendas-produtos?limite=200`, { headers: recepcao.headers() })).json();
    const legada = vendas.find((v) => !v.pagamento_registrado && !v.estorno_status);
    expect(legada).toBeTruthy();
    const dia = legada.data_venda.slice(0, 10);
    await signIn(page, 'recepcao');
    await page.getByRole('link', { name: 'Vendas', exact: true }).click();
    await page.getByLabel('Data inicial').fill(dia);
    await page.getByLabel('Data final').fill(dia);
    await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
    const row = page.locator(`tr[data-venda-id="${legada.id}"]`);
    await expect(row.getByTestId('venda-meios')).toHaveText('Meio não registrado');
    await row.getByRole('button', { name: 'Estorno', exact: true }).click();
    await expect(page.getByTestId('sem-meio-registrado')).toBeVisible();
  });

  test('perfil e unidade sem permissão não alteram venda, estoque nem meios', async ({ request }) => {
    const operador = await apiLogin(request, 'operador');
    const antes = await estoque(request, recepcao, produto.id);
    const conferenciaAntes = await (await request.get(`${api}/vendas-produtos/conferencia-meios`, { headers: recepcao.headers() })).json();
    const pagamentos = [{ meio: 'dinheiro', valor: 5 }];

    let response = await venderPorApi(request, operador, produto.id, pagamentos);
    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe('PERMISSAO_NEGADA');
    response = await request.post(`${api}/vendas-produtos`, {
      headers: { Authorization: `Bearer ${recepcao.token}`, 'X-Unit-Id': String(owner.filial.id) },
      data: { produto_id: produto.id, quantidade: 1, pagamentos },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe('UNIT_FORBIDDEN');

    const { venda, estorno } = await vendaAprovada(request, { recepcao, gestor, produtoId: produto.id });
    const depoisVenda = await estoque(request, recepcao, produto.id);
    response = await request.post(`${api}/vendas-produtos/estornos/${estorno.id}/executar`, {
      headers: gestor.headers(),
      data: { itens: [{ produto_id: produto.id, quantidade_reposta: 1 }], devolucoes: [{ meio: 'pix', valor: 5 }], devolucao_confirmada: true },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe('PERMISSAO_NEGADA');
    response = await request.post(`${api}/vendas-produtos/estornos/${estorno.id}/executar`, {
      headers: owner.headers(owner.filial),
      data: { itens: [{ produto_id: produto.id, quantidade_reposta: 1 }], devolucoes: [{ meio: 'pix', valor: 5 }], devolucao_confirmada: true },
    });
    expect(response.status()).toBe(404);
    expect(await estoque(request, recepcao, produto.id)).toBe(depoisVenda);
    expect(depoisVenda).toBe(antes - 1);
    const detalhe = await conferenciaDaVenda(request, recepcao, venda.id);
    expect(detalhe.reversao_controlada_id).toBeNull();
    expect(detalhe.devolucoes).toHaveLength(0);
    const conferenciaDepois = await (await request.get(`${api}/vendas-produtos/conferencia-meios`, { headers: recepcao.headers() })).json();
    expect(Math.round((conferenciaDepois.total.liquido - conferenciaAntes.total.liquido) * 100)).toBe(500);
  });
});
