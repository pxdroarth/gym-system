const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const sqlite = require('sqlite3');

// Execute somente com a API e o SQLite descartáveis criados por smoke-sqlite.ps1.
const base = process.argv.find((arg) => arg.startsWith('--base-url='))?.slice(11);
const dbPath = process.argv.find((arg) => arg.startsWith('--db='))?.slice(5);
assert.ok(base && dbPath, 'Informe --base-url e --db da API descartavel');
const db = new sqlite.Database(dbPath, sqlite.OPEN_READWRITE);
db.configure('busyTimeout', 5000);
const senha = process.env.SEED_DEV_PASSWORD || 'dev12345';
const marca = randomUUID();
let total = 0;

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (error) => error ? reject(error) : resolve());
  });
}

async function request(method, route, { token, unit, body, key } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (unit) headers['X-Unit-Id'] = String(unit);
  if (key) headers['Idempotency-Key'] = key;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + route, { method, headers, body: body && JSON.stringify(body) });
  const raw = await response.text();
  let json;
  try { json = JSON.parse(raw); } catch {
    throw new Error(`${method} ${route}: HTTP ${response.status}, resposta sem JSON valido`);
  }
  return { status: response.status, json, replay: response.headers.get('Idempotent-Replayed') };
}

function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  console.log(`[OK] ${label}`);
  total++;
}

async function snapshot() {
  const tables = ['produto', 'venda_produto', 'conta_financeira', 'fechamento_mensal', 'reversao_controlada'];
  return Promise.all([
    ...tables.map((table) => all(`SELECT * FROM ${table} ORDER BY id`)),
    all(`SELECT * FROM audit_log WHERE action IN (
      'criar_conta_financeira', 'editar_conta_financeira', 'registrar_venda_produto', 'fechar_periodo', 'reabrir_periodo'
    ) ORDER BY id`),
  ]);
}

async function negar(label, method, route, options, status, code) {
  const antes = await snapshot();
  const resposta = await request(method, route, options);
  check(label, [resposta.status, resposta.json.code], [status, code]);
  check(`${label}: dados de negocio e auditoria de conclusao preservados`, await snapshot(), antes);
}

async function login(login) {
  const res = await request('POST', '/auth/login', { body: { login, senha } });
  assert.equal(res.status, 200, `login ${login}`);
  return res.json.data;
}

async function main() {
  const owner = await login('owner');
  const recepcao = await login('recepcao');
  const operador = await login('operador');
  const gestor = await login('gestor');
  const outraRede = await login('smoke.owner.redeb');
  const matriz = owner.usuario.allowedUnits.find((unit) => unit.is_matriz);
  const filial = owner.usuario.allowedUnits.find((unit) => !unit.is_matriz);
  const outra = outraRede.usuario.allowedUnits[0];
  const naMatriz = { token: owner.token, unit: matriz.id };
  const naRecepcao = { token: recepcao.token, unit: matriz.id };
  const conta = { descricao: marca, tipo: 'despesa', valor: 100, status: 'pendente' };
  const rotaContas = '/contas-financeiras';
  await negar('POST data omitida', 'POST', rotaContas, { ...naMatriz, body: conta }, 400, 'DATA_LANCAMENTO_INVALIDA');
  const criada = await request('POST', rotaContas, { ...naMatriz, body: { ...conta, data_lancamento: '2028-02-29' } });
  check('POST aceita dia bissexto real', criada.status, 201);
  const rotaConta = `${rotaContas}/${criada.json.id}`;
  await negar('PUT sem os demais campos obrigatorios', 'PUT', rotaConta,
    { ...naMatriz, body: {} }, 400, 'CONTA_PAYLOAD_INVALIDO');

  for (const data of [null, '', '29/02/2028', '2026-02-31', '2028-02-29T00:00:00Z']) {
    for (const [method, route] of [['POST', rotaContas], ['PUT', rotaConta]]) {
      await negar(`${method} data ${JSON.stringify(data)}`, method, route,
        { ...naMatriz, body: { ...conta, data_lancamento: data } }, 400, 'DATA_LANCAMENTO_INVALIDA');
    }
  }

  const omitida = await request('PUT', rotaConta, { ...naMatriz, body: { ...conta, valor: 125 } });
  check('PUT sem data preserva a data atual e grava valor', [omitida.status, omitida.json.conta?.data_lancamento, omitida.json.conta?.valor],
    [200, '2028-02-29', 125]);
  check('fecha periodo da origem', (await request('POST', '/fechamento-mensal/2028/2/fechar', naMatriz)).status, 200);
  await negar('PUT sem data com origem fechada', 'PUT', rotaConta, { ...naMatriz, body: conta }, 423, 'PERIODO_FECHADO');
  const outraConta = await request('POST', rotaContas, { ...naMatriz, body: { ...conta, data_lancamento: '2028-03-01' } });
  check('conta em outro periodo aberto', outraConta.status, 201);
  await negar('PUT com destino fechado', 'PUT', `${rotaContas}/${outraConta.json.id}`,
    { ...naMatriz, body: { ...conta, data_lancamento: '2028-02-29' } }, 423, 'PERIODO_FECHADO');

  const produto = { nome: marca, preco: 25, estoque: 3 };
  const criacao = await request('POST', '/produtos', { ...naMatriz, body: produto });
  check('owner cadastra produto', criacao.status, 201);
  const id = criacao.json.id;
  const rotaProduto = `/produtos/${id}`;
  const rotaVendas = '/vendas-produtos';
  const pedido = { produto_id: id, quantidade: 3 };
  const opcoes = { ...naRecepcao, body: pedido, key: marca };
  await negar('operador de acesso nao vende', 'POST', rotaVendas, { ...opcoes, token: operador.token }, 403, 'PERMISSAO_NEGADA');
  await negar('recepcao nao ajusta estoque por PATCH', 'PATCH', `${rotaProduto}/estoque`,
    { ...naRecepcao, body: { estoque: 10 } }, 403, 'PERMISSAO_NEGADA');
  await negar('recepcao nao ajusta estoque por PUT', 'PUT', rotaProduto,
    { ...naRecepcao, body: { ...produto, estoque: 10 } }, 403, 'PERMISSAO_NEGADA');
  await negar('produto de outra unidade nao pode ser vendido', 'POST', rotaVendas,
    { ...opcoes, token: owner.token, unit: filial.id }, 404, 'PRODUTO_NAO_ENCONTRADO');
  await negar('produto de outra rede nao pode ser vendido', 'POST', rotaVendas,
    { ...opcoes, token: outraRede.token, unit: outra.id }, 404, 'PRODUTO_NAO_ENCONTRADO');

  const estado = async () => {
    const [estoque] = await all('SELECT estoque FROM produto WHERE id = ?', [id]);
    const vendas = await all('SELECT id FROM venda_produto WHERE produto_id = ? ORDER BY id', [id]);
    const receitas = await all(`
      SELECT cf.tipo, cf.valor, cf.status, cf.plano_contas_id, cf.tenant_id, cf.unit_id
      FROM conta_financeira cf JOIN venda_produto v ON v.id = cf.origem_id
      WHERE cf.origem = 'venda_produto' AND cf.deleted_at IS NULL AND v.produto_id = ?
      ORDER BY cf.id
    `, [id]);
    const eventos = await all(`
      SELECT a.id FROM audit_log a JOIN venda_produto v ON CAST(v.id AS TEXT) = a.record_id
      WHERE a.action = 'registrar_venda_produto' AND v.produto_id = ?
    `, [id]);
    return { estoque: estoque.estoque, vendas, receitas, auditorias: eventos.length };
  };

  await run(`CREATE TRIGGER l04_falha_receita BEFORE INSERT ON conta_financeira
    WHEN NEW.origem = 'venda_produto' BEGIN SELECT RAISE(ABORT, 'l04 falha injetada'); END`);
  try {
    await negar('falha na receita depois de gravar venda e baixar estoque', 'POST', rotaVendas, opcoes, 500, undefined);
  } finally {
    await run('DROP TRIGGER l04_falha_receita');
  }

  const [categoria] = await all('SELECT id, tipo, tenant_id FROM plano_contas WHERE id = 2');
  check('fixture: categoria 2 e despesa da rede da Matriz', [categoria.tipo, categoria.tenant_id], ['despesa', matriz.tenant_id]);
  const antesPerda = await fetch(base + rotaVendas, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${recepcao.token}`,
      'X-Unit-Id': String(matriz.id),
      'Content-Type': 'application/json',
      'Idempotency-Key': marca,
    },
    body: JSON.stringify(pedido),
  });
  check('recepcao registra venda cujo corpo da resposta sera descartado', antesPerda.status, 201);
  await antesPerda.body.cancel();
  const depois = await estado();
  check('uma venda, uma baixa, uma receita sem categoria de despesa e uma auditoria', depois, {
    estoque: 0,
    vendas: [{ id: depois.vendas[0]?.id }],
    receitas: [{ tipo: 'receita', valor: 75, status: 'pago', plano_contas_id: null, tenant_id: matriz.tenant_id, unit_id: matriz.id }],
    auditorias: 1,
  });

  const periodoAtual = new Date().toISOString().slice(0, 7).replace('-', '/');
  check('fechamento apos a primeira venda', (await request('POST', `/fechamento-mensal/${periodoAtual}/fechar`, naMatriz)).status, 200);
  const fechado = await snapshot();
  const reenvio = await request('POST', '/vendasProdutos', opcoes);
  check('reenvio pelo alias retorna a venda original mesmo sem estoque e com periodo fechado',
    [reenvio.status, reenvio.replay, reenvio.json.id], [200, 'true', depois.vendas[0].id]);
  check('reenvio preserva estoque, lancamentos, fechamento e auditoria', await snapshot(), fechado);
  await negar('mesma chave com outros dados', 'POST', rotaVendas,
    { ...opcoes, body: { ...pedido, quantidade: 1 } }, 409, 'IDEMPOTENCIA_CONFLITO');
  const ajuste = await request('PATCH', `${rotaProduto}/estoque`, { token: gestor.token, unit: matriz.id, body: { estoque: 4 } });
  check('gestor ajusta estoque da sua unidade', [ajuste.status, ajuste.json.estoque], [200, 4]);
  await negar('nova venda em periodo fechado', 'POST', rotaVendas, { ...opcoes, key: randomUUID() }, 423, 'PERIODO_FECHADO');
  check('owner reabre periodo', (await request('POST', `/fechamento-mensal/${periodoAtual}/reabrir`,
    { ...naMatriz, body: { motivo: 'Smoke L04' } })).status, 200);
  await negar('estoque insuficiente', 'POST', rotaVendas, { ...opcoes, key: randomUUID(), body: { ...pedido, quantidade: 5 } },
    400, 'ESTOQUE_INSUFICIENTE');

  try {
    await run("UPDATE plano_contas SET tipo = 'receita', tenant_id = ? WHERE id = 2", [outra.tenant_id]);
    const concorrente = { ...opcoes, key: randomUUID(), body: { ...pedido, quantidade: 1 } };
    const respostas = await Promise.all([request('POST', rotaVendas, concorrente), request('POST', rotaVendas, concorrente)]);
    check('chave concorrente cria uma venda', respostas.map((r) => r.status).sort(), [200, 201]);
    check('chave concorrente devolve a mesma venda', respostas[0].json.id, respostas[1].json.id);
    let atual = await estado();
    check('categoria de receita de outra rede descartada e sem baixa duplicada',
      [atual.estoque, atual.vendas.length, atual.receitas.map((r) => r.plano_contas_id), atual.auditorias], [3, 2, [null, null], 2]);

    await run("UPDATE plano_contas SET tenant_id = ? WHERE id = 2", [matriz.tenant_id]);
    check('venda com categoria compativel da rede', (await request('POST', rotaVendas, { ...concorrente, key: randomUUID() })).status, 201);
    atual = await estado();
    check('categoria compativel atribuida', atual.receitas.map((r) => r.plano_contas_id), [null, null, 2]);
  } finally {
    await run('UPDATE plano_contas SET tipo = ?, tenant_id = ? WHERE id = 2', [categoria.tipo, categoria.tenant_id]);
  }
  check('sincronizacao financeira da unidade', (await request('POST', '/dashboard/financeiro/sincronizar', naMatriz)).status, 200);
  check('sincronizacao tambem descarta categoria de despesa', (await estado()).receitas.map((r) => r.plano_contas_id), [null, null, null]);
  console.log(`[smoke-l04-integridade] ${total}/${total} verificacoes OK`);
}

main().catch((error) => {
  console.error('[FALHOU]', error);
  process.exitCode = 1;
}).finally(() => db.close());
