// Execute apos smoke-identidade em base descartavel (Matriz, Filial e Rede B).
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const sqlite = require('sqlite3');
const { dataLocalISO } = require('../../backend/utils/dataLocal');
const base = process.argv.find((arg) => arg.startsWith('--base-url='))?.slice(11) || 'http://localhost:3001';
const dbPath = process.argv.find((arg) => arg.startsWith('--db='))?.slice(5);
const senha = process.env.SEED_DEV_PASSWORD || 'dev12345';
const run = Date.now().toString(36);
let total = 0;
const httpTrace = [];
const completedActions = [
  'emitir_mensalidade_padrao',
  'criar_mensalidade',
  'conceder_desconto_excepcional',
  'registrar_pagamento_mensalidade',
];

async function req(method, path, { session, unit, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.token}`;
  if (unit) headers['X-Unit-Id'] = String(unit);
  if (key) headers['Idempotency-Key'] = key;
  let response;
  try {
    response = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
  } catch {
    throw new Error(`${method} ${path}: sem resposta HTTP`);
  }
  return lerResposta(method, path, response);
}

async function lerResposta(method, path, response) {
  const context = `${method} ${path} -> HTTP ${response.status}`;
  httpTrace.push(context);
  const raw = await response.text().catch(() => {
    throw new Error(`${context}: falha ao ler o corpo`);
  });
  if (response.status === 204 && !raw) return { status: response.status, json: null, context };
  if (!raw.trim()) throw new Error(`${context}: corpo vazio; esperado JSON`);
  if (!/^application\/(?:[\w.+-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
    throw new Error(`${context}: Content-Type diferente de JSON`);
  }
  try {
    return { status: response.status, json: JSON.parse(raw), context };
  } catch {
    throw new Error(`${context}: JSON invalido`);
  }
}

function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  total++;
  console.log(`[OK] ${label}`);
}

async function verificarDiagnosticoHttp() {
  for (const [descricao, corpo, tipo, motivo] of [
    ['corpo vazio', '', 'application/json', 'corpo vazio; esperado JSON'],
    ['HTML', '<html>conteudo sintetico reservado</html>', 'text/html', 'Content-Type diferente de JSON'],
    ['JSON malformado', '{conteudo sintetico reservado', 'application/json', 'JSON invalido'],
  ]) {
    const resposta = new Response(corpo, { status: 502, headers: { 'Content-Type': tipo } });
    const erro = await lerResposta('POST', '/fixture', resposta).catch((error) => error);
    check(`diagnostico HTTP para ${descricao} inclui metodo, rota e status e omite o corpo`,
      erro.message, `POST /fixture -> HTTP 502: ${motivo}`);
  }
  httpTrace.length = 0;
}

async function login(login, password = senha) {
  const result = await req('POST', '/auth/login', { body: { login, senha: password } });
  assert.equal(result.status, 200, result.context);
  assert.ok(result.json?.data?.token, `${result.context}: sessao ausente no JSON`);
  return result.json.data;
}

function consultar(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

async function estadoNegocio(db) {
  // Base isolada, sem outras operacoes durante os checks. A foto integral
  // tambem detecta gravacao na unidade errada e lancamento sem vinculo.
  const [mensalidades, pagamentos, lancamentos] = await Promise.all([
    consultar(db, 'SELECT * FROM mensalidade ORDER BY id'),
    consultar(db, 'SELECT * FROM pagamento ORDER BY id'),
    consultar(db, 'SELECT * FROM conta_financeira ORDER BY id'),
  ]);
  return { mensalidades, pagamentos, lancamentos };
}

async function esperarRecusa(db, label, method, path, options, status, code) {
  const antes = await estadoNegocio(db);
  const [{ id: ultimaAuditoria }] = await consultar(db, 'SELECT COALESCE(MAX(id), 0) AS id FROM audit_log');
  const resposta = await req(method, path, options);
  check(`${label} (${resposta.context})`, [resposta.status, resposta.json?.code], [status, code]);
  const depois = await estadoNegocio(db);
  check(`${label}: cobrancas, pagamentos e lancamentos intactos`, isDeepStrictEqual(depois, antes), true);
  const auditorias = await consultar(db, 'SELECT action FROM audit_log WHERE id > ?', [ultimaAuditoria]);
  const concluidas = auditorias.filter(({ action }) => completedActions.includes(action));
  check(`${label}: nenhuma auditoria de operacao concluida`, concluidas.length, 0);
  console.log(`[INFO] ${label}: resposta de recusa no HTTP; outros eventos em audit_log: ${auditorias.length - concluidas.length}`);
}

async function main(db) {
  const [owner, recepcao, gestor, financeiro, operador, ownerB, master] = await Promise.all([
    ...['owner', 'recepcao', 'gestor', 'financeiro', 'operador', 'smoke.owner.redeb'].map((name) => login(name)),
    login(process.env.SMOKE_PLATFORM_LOGIN || 'admin', process.env.SMOKE_PLATFORM_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin123'),
  ]);
  const matriz = owner.usuario.allowedUnits.find((unit) => unit.is_matriz).id;
  const filial = owner.usuario.allowedUnits.find((unit) => !unit.is_matriz).id;
  const outraRede = ownerB.usuario.allowedUnits[0].id;
  const criarUsuario = (login, papel, unidades) => req('POST', '/usuarios-internos', {
    session: owner, unit: matriz, body: { nome: login, login, senha, papel, unit_ids: unidades },
  });
  const adminLogin = `l02.admin.${run}`;
  check('admin da Filial criado', (await criarUsuario(adminLogin, 'admin', [filial])).status, 201);
  const admin = await login(adminLogin);
  const rotaPolitica = '/units/politica-retorno';
  const politicaIntegral = { politica: 'integral' };
  check('politica de retorno sem sessao', (await req('PATCH', rotaPolitica, { unit: matriz, body: politicaIntegral })).status, 401);
  check('admin vinculado nao configura retorno', (await req('PATCH', rotaPolitica, { session: admin, unit: filial, body: politicaIntegral })).status, 403);
  check('owner nao configura unidade de outra Rede', (await req('PATCH', rotaPolitica, { session: owner, unit: outraRede, body: politicaIntegral })).status, 403);
  check('politica fora do enum recusada', (await req('PATCH', rotaPolitica, { session: owner, unit: matriz, body: { politica: 'invalida' } })).status, 400);
  check('Matriz sem configuracao usa proporcional',
    (await req('GET', rotaPolitica, { session: owner, unit: matriz })).json, { politica: 'proporcional', configurada: false });
  check('owner salva integral na Filial',
    (await req('PATCH', rotaPolitica, { session: owner, unit: filial, body: politicaIntegral })).json, { politica: 'integral', configurada: true });
  check('Filial salva preserva a politica da Matriz',
    (await req('GET', rotaPolitica, { session: owner, unit: matriz })).json, { politica: 'proporcional', configurada: false });

  const planos = await req('GET', '/planos', { session: recepcao, unit: matriz });
  const plano = planos.json.find((item) => item.tipo_cobranca === 'AVULSO_MENSAL');
  assert.ok(plano);
  const payload = {
    nome: `Aluno L02 ${run}`, status: 'ativo', plano_id: plano.id,
    dia_vencimento: 31, data_nascimento: '1990-01-01', telefone: '1000',
  };
  check('cadastro sem sessao', (await req('POST', '/alunos', { body: payload })).status, 401);
  check('operador de acesso nao cadastra', (await req('POST', '/alunos', { session: operador, unit: matriz, body: payload })).status, 403);
  const cadastrado = await req('POST', '/alunos', { session: recepcao, unit: matriz, body: payload });
  check('recepcao cadastra aluno com plano inicial', cadastrado.status, 201);
  const aluno = cadastrado.json;
  const rotaAluno = `/alunos/${aluno.id}`;
  const editar = { ...payload, plano_id: String(plano.id), dia_vencimento: '31', telefone: '2000' };
  check('formulario completo com campos sensiveis normalizados', (await req('PUT', rotaAluno, { session: recepcao, unit: matriz, body: editar })).status, 200);
  check('recusa de mudanca sensivel', (await req('PUT', rotaAluno, {
    session: recepcao, unit: matriz, body: { ...editar, telefone: '3000', status: 'inativo' },
  })).status, 403);
  const preservado = (await req('GET', rotaAluno, { session: recepcao, unit: matriz })).json;
  check('edicao recusada nao altera telefone, status, plano ou vencimento',
    [preservado.telefone, preservado.status, preservado.plano_id, preservado.dia_vencimento], ['2000', 'ativo', plano.id, 31]);

  const rotaPadrao = '/mensalidades/padrao';
  const corpo = { aluno_id: aluno.id, valor_cobrado: 0.01, desconto_aplicado: 99, vencimento: '2099-01-01', data_inicio: '2099-01-01', data_fim: '2099-12-31', status: 'pago' };
  const antesEmissao = await estadoNegocio(db);
  check('aluno novo sem cobranca na base', antesEmissao.mensalidades.filter((row) => row.aluno_id === aluno.id).length, 0);
  await esperarRecusa(db, 'emissao padrao sem sessao', 'POST', rotaPadrao, { unit: matriz, body: corpo }, 401, 'OPERADOR_NAO_RESOLVIDO');
  await esperarRecusa(db, 'operador nao emite', 'POST', rotaPadrao, { session: operador, unit: matriz, body: corpo }, 403, 'PERMISSAO_NEGADA');
  const excepcional = { aluno_id: aluno.id, plano_id: plano.id, valor_cobrado: 90, vencimento: dataLocalISO() };
  await esperarRecusa(db, 'recepcao nao emite lancamento excepcional', 'POST', '/mensalidades',
    { session: recepcao, unit: matriz, body: excepcional }, 403, 'PERMISSAO_NEGADA');
  await esperarRecusa(db, 'emissao com unidade sem vinculo', 'POST', rotaPadrao,
    { session: recepcao, unit: filial, body: corpo }, 403, 'UNIT_FORBIDDEN');
  await esperarRecusa(db, 'emissao sobre aluno de outra unidade', 'POST', rotaPadrao,
    { session: admin, unit: filial, body: corpo }, 404, 'ALUNO_NAO_ENCONTRADO');
  await esperarRecusa(db, 'emissao sobre aluno de outra Rede', 'POST', rotaPadrao,
    { session: ownerB, unit: outraRede, body: corpo }, 404, 'ALUNO_NAO_ENCONTRADO');

  const emitidas = await Promise.all(Array.from({ length: 3 }, () => req('POST', rotaPadrao, { session: recepcao, unit: matriz, body: corpo })));
  check('emissao concorrente responde 201 + 200 + 200', emitidas.map((item) => item.status).sort(), [200, 200, 201]);
  const cobranca = emitidas[0].json;
  check('as respostas apontam para a mesma cobranca', new Set(emitidas.map((item) => item.json.id)).size, 1);
  const hoje = dataLocalISO();
  check('emissao desconsidera data, preco, desconto e status do corpo adulterado',
    cobranca.vencimento === hoje && cobranca.data_inicio === hoje && cobranca.data_fim < corpo.data_fim
      && cobranca.valor_cobrado > corpo.valor_cobrado && cobranca.desconto_aplicado < corpo.desconto_aplicado
      && cobranca.status === 'em_aberto', true);

  const aposEmissao = await estadoNegocio(db);
  const cobrancasAluno = aposEmissao.mensalidades.filter((row) => row.aluno_id === aluno.id);
  check('SQLite: exatamente uma cobranca do aluno, com o mesmo ciclo e ID da resposta',
    cobrancasAluno.map(({ id, data_inicio, data_fim, vencimento, tenant_id, unit_id }) =>
      [id, data_inicio, data_fim, vencimento, tenant_id, unit_id]),
    [[cobranca.id, cobranca.data_inicio, cobranca.data_fim, cobranca.vencimento, cobranca.tenant_id, matriz]]);
  check('SQLite: emissao acrescenta somente uma cobranca no banco', aposEmissao.mensalidades.length - antesEmissao.mensalidades.length, 1);
  check('SQLite: emissao nao gera pagamento', isDeepStrictEqual(aposEmissao.pagamentos, antesEmissao.pagamentos), true);
  const pendencias = aposEmissao.lancamentos.filter((row) => row.origem === 'mensalidade' && row.origem_id === cobranca.id);
  check('SQLite: uma receita a receber, mesmo valor, origem, data e escopo da cobranca',
    pendencias.map(({ tipo, status, valor, data_lancamento, tenant_id, unit_id, deleted_at }) =>
      [tipo, status, valor, data_lancamento, tenant_id, unit_id, deleted_at]),
    [['receita', 'pendente', cobranca.valor_cobrado, cobranca.vencimento, cobranca.tenant_id, matriz, null]]);
  check('SQLite: nenhum outro efeito financeiro da emissao', aposEmissao.lancamentos.length - antesEmissao.lancamentos.length, 1);
  const eventosEmissao = await consultar(db, "SELECT id FROM audit_log WHERE action = 'emitir_mensalidade_padrao' AND record_id = ?", [String(cobranca.id)]);
  check('SQLite: somente uma emissao concluida na auditoria', eventosEmissao.length, 1);

  const desconto = `/mensalidades/${cobranca.id}/desconto`;
  const pedidoDesconto = { desconto: 1, motivo: 'Excecao auditada', valor_cobrado_esperado: cobranca.valor_cobrado };
  await esperarRecusa(db, 'caixa nao concede desconto', 'PATCH', desconto,
    { session: recepcao, unit: matriz, body: pedidoDesconto }, 403, 'PERMISSAO_NEGADA');
  await esperarRecusa(db, 'desconto sem motivo', 'PATCH', desconto,
    { session: gestor, unit: matriz, body: { ...pedidoDesconto, motivo: '' } }, 400, 'MOTIVO_OBRIGATORIO');
  await esperarRecusa(db, 'desconto com unidade sem vinculo', 'PATCH', desconto,
    { session: financeiro, unit: filial, body: pedidoDesconto }, 403, 'UNIT_FORBIDDEN');
  await esperarRecusa(db, 'desconto sobre cobranca de outra unidade', 'PATCH', desconto,
    { session: admin, unit: filial, body: pedidoDesconto }, 404, 'MENSALIDADE_NAO_ENCONTRADA');
  await esperarRecusa(db, 'desconto sobre cobranca de outra Rede', 'PATCH', desconto,
    { session: ownerB, unit: outraRede, body: pedidoDesconto }, 404, 'MENSALIDADE_NAO_ENCONTRADA');

  const reduzida = await req('PATCH', desconto, { session: financeiro, unit: matriz, body: pedidoDesconto });
  check('financeiro concede desconto na Matriz', [reduzida.status, Math.round(reduzida.json.valor_cobrado * 100)], [200, Math.round(cobranca.valor_cobrado * 100) - 100]);
  const aposDesconto = await estadoNegocio(db);
  const [contaAtualizada] = aposDesconto.lancamentos.filter(({ id }) => id === pendencias[0].id);
  check('SQLite: desconto atualiza o mesmo lancamento pendente na Matriz, sem outro lancamento',
    [contaAtualizada.valor, contaAtualizada.status, contaAtualizada.unit_id, aposDesconto.lancamentos.length],
    [reduzida.json.valor_cobrado, 'pendente', matriz, aposEmissao.lancamentos.length]);
  check('SQLite: desconto autorizado nao gera pagamento', isDeepStrictEqual(aposDesconto.pagamentos, aposEmissao.pagamentos), true);
  await esperarRecusa(db, 'reenvio nao duplica desconto', 'PATCH', desconto,
    { session: financeiro, unit: matriz, body: pedidoDesconto }, 409, 'DESCONTO_VALOR_ALTERADO');

  const pagar = (session, valor, key) => req('POST', '/pagamentos', {
    session, unit: matriz, key, body: { mensalidade_id: cobranca.id, valor_pago: valor, data_pagamento: hoje },
  });
  check('operador nao recebe', (await pagar(operador, 1, `l02-neg-${run}`)).status, 403);
  const parcial = await pagar(recepcao, 1, `l02-parc-${run}`);
  check('recepcao recebe parcial', [parcial.status, parcial.json.status_mensalidade], [201, 'parcial']);
  const repetido = await pagar(recepcao, 1, `l02-parc-${run}`);
  check('reenvio recupera mesmo pagamento', [repetido.status, repetido.json.id], [200, parcial.json.id]);
  await esperarRecusa(db, 'desconto em cobranca com pagamento parcial', 'PATCH', desconto, {
    session: financeiro, unit: matriz, body: { ...pedidoDesconto, valor_cobrado_esperado: reduzida.json.valor_cobrado },
  }, 409, 'DESCONTO_NAO_APLICAVEL');
  const quitacao = await pagar(gestor, parcial.json.saldo_em_aberto, `l02-quit-${run}`);
  check('gestor quita saldo', [quitacao.status, quitacao.json.status_mensalidade], [201, 'pago']);
  const estorno = await req('POST', `/pagamentos/${parcial.json.id}/estornar`, { session: financeiro, body: { motivo: 'Sem aprovacao' } });
  check('estorno direto bloqueado', [estorno.status, estorno.json.code], [409, 'REVERSAO_APROVACAO_NECESSARIA']);

  const resumo = await req('GET', '/tenant-dashboard/resumo', { session: admin, unit: filial });
  check('admin ve somente unidades autorizadas', resumo.json.data.unidades.map((unit) => unit.id), [filial]);
  check('total financeiro do admin corresponde a Filial', resumo.json.data.totais.receitas, resumo.json.data.unidades[0].receitas);
  check('owner ve toda a Rede', (await req('GET', '/tenant-dashboard/resumo', { session: owner })).json.data.unidades.length, 2);
  const categoria = { nome: `L02 ${run}`, tipo: 'receita' };
  for (const path of ['/plano-contas', '/planoContas']) {
    check(`admin nao altera categorias compartilhadas em ${path}`, (await req('POST', path, { session: admin, body: categoria })).status, 403);
  }
  check('owner cadastra categoria de Rede', (await req('POST', '/plano-contas', { session: owner, body: categoria })).status, 201);
  check('admin nao edita catalogo compartilhado', (await req('PUT', `/planos/${plano.id}`, { session: admin, body: plano })).status, 403);

  const novoPlano = { nome: `Plano compartilhado ${run}`, valor_base: 110, duracao_em_dias: 30 };
  const individual = await req('POST', '/planos', { session: owner, unit: matriz, body: novoPlano });
  check('owner cria plano individual no catalogo da Rede', individual.status, 201);
  const rotaPlano = `/planos/${individual.json.id}`;
  const cadastrarNoPlano = (unit, nome, planoId) => req('POST', '/alunos', {
    session: owner, unit, body: { ...payload, nome: `${nome} ${run}`, plano_id: planoId },
  });
  for (const [unit, nome] of [[matriz, 'Titular Matriz'], [filial, 'Titular Filial']]) {
    check(`${nome} usa o mesmo plano individual`,
      (await cadastrarNoPlano(unit, nome, individual.json.id)).status, 201);
  }
  const nomeNovo = `Individual renomeado ${run}`;
  const renomeado = await req('PUT', rotaPlano, {
    session: owner, unit: matriz, body: { ...individual.json, nome: nomeNovo },
  });
  check(`owner renomeia plano individual usado em duas unidades (${renomeado.context})`, renomeado.status, 200);
  const nomeFinal = `Individual atualizado ${run}`;
  const nomeSomente = await req('PUT', rotaPlano, { session: owner, unit: matriz, body: { nome: nomeFinal } });
  check('edicao apenas do nome preserva demais campos', [nomeSomente.status, nomeSomente.json], [200, { ...individual.json, nome: nomeFinal }]);
  check('admin da Filial nao edita plano da Rede',
    (await req('PUT', rotaPlano, { session: admin, unit: filial, body: { ...individual.json, nome: nomeNovo } })).status, 403);
  check('owner nao exclui plano em uso nas unidades', (await req('DELETE', rotaPlano, { session: owner, unit: matriz })).status, 400);

  const familiar = await req('POST', '/planos', {
    session: owner, unit: matriz,
    body: { nome: `Familiar ${run}`, valor_base: 130, compartilhado: 1, quantidade_max_pessoas: 3 },
  });
  check('owner cria plano para titular e dois dependentes', familiar.status, 201);
  const titular = await cadastrarNoPlano(filial, 'Titular familiar', familiar.json.id);
  check('titular familiar pertence a Filial', titular.status, 201);
  const vinculos = [];
  for (const nome of ['Dependente 1', 'Dependente 2']) {
    const dependente = await cadastrarNoPlano(filial, nome, individual.json.id);
    check(`${nome} cadastrado com plano proprio diferente`, dependente.status, 201);
    const vinculo = await req('POST', '/plano-associado', {
      session: owner, unit: filial, body: { aluno_id: dependente.json.id, responsavel_id: titular.json.id },
    });
    check(`${nome} vinculado ao titular da Filial`, vinculo.status, 201);
    vinculos.push(vinculo.json.id);
  }
  const rotaFamiliar = `/planos/${familiar.json.id}`;
  const reduzir = () => req('PUT', rotaFamiliar, {
    session: owner, unit: matriz, body: { ...familiar.json, quantidade_max_pessoas: 2 },
  });
  check('Matriz nao reduz limite abaixo de titular e dois dependentes da Filial', (await reduzir()).status, 400);
  const planoPreservado = await req('GET', rotaFamiliar, { session: owner, unit: filial });
  check('reducao recusada preserva limite 3', planoPreservado.json.quantidade_max_pessoas, 3);
  check('owner encerra um vinculo na Filial',
    (await req('DELETE', `/plano-associado/${vinculos[0]}`, { session: owner, unit: filial })).status, 200);
  const reduzido = await reduzir();
  check('limite 2 aceito para titular e um dependente; vinculo encerrado nao conta',
    [reduzido.status, reduzido.json.quantidade_max_pessoas], [200, 2]);
  check('Matriz nao exclui plano em uso apenas na Filial',
    (await req('DELETE', rotaFamiliar, { session: owner, unit: matriz })).status, 400);

  const periodo = '/fechamento-mensal/2031/8';
  check('financeiro confere fechamento', (await req('GET', periodo + '/analisar', { session: financeiro })).status, 200);
  check('financeiro nao fecha', (await req('POST', periodo + '/fechar', { session: financeiro })).status, 403);
  check('admin nao fecha unidade sem vinculo', (await req('POST', periodo + '/fechar', { session: admin, unit: matriz })).status, 403);
  check('admin fecha Filial', (await req('POST', periodo + '/fechar', { session: admin, unit: filial })).status, 200);
  check('admin nao reabre', (await req('POST', periodo + '/reabrir', { session: admin, body: { motivo: 'Teste' } })).status, 403);
  check('Matriz continua sem fechamento', (await req('POST', periodo + '/reabrir', { session: owner, unit: matriz, body: { motivo: 'Teste' } })).status, 404);
  check('owner precisa informar motivo', (await req('POST', periodo + '/reabrir', { session: owner, unit: filial })).status, 400);
  const reaberto = await req('POST', periodo + '/reabrir', { session: owner, unit: filial, body: { motivo: 'Conferencia L02' } });
  check('owner reabre Filial', reaberto.status, 200);

  const alvoLogin = `l02.vinculo.${run}`;
  check('alvo tem Matriz e Filial', (await criarUsuario(alvoLogin, 'recepcao', [matriz, filial])).status, 201);
  const alvo = await login(alvoLogin);
  const rotaVinculo = `/usuarios-internos/${alvo.usuario.id}/vinculo-unidade`;
  const redeBId = ownerB.usuario.allowedUnits[0].tenant_id;
  check('fixture vincula alvo a Rede B', (await req('PATCH', `/usuarios-internos/${alvo.usuario.id}/unidades`, {
    session: master, body: { tenant_id: redeBId, unit_ids: [outraRede] },
  })).status, 200);
  const alvoComDuasRedes = await login(alvoLogin);
  check('recepcao nao desativa vinculo', (await req('DELETE', rotaVinculo, { session: recepcao })).status, 403);
  check('admin desativa somente vinculo da Filial', (await req('DELETE', rotaVinculo, { session: admin, unit: filial })).status, 204);
  check('sessao anterior revogada', (await req('GET', '/auth/me', { session: alvoComDuasRedes })).status, 401);
  const alvoDepois = await login(alvoLogin);
  check('Matriz e outra Rede preservadas', alvoDepois.usuario.allowedUnits.map((unit) => unit.id).sort((a, b) => a - b), [matriz, outraRede].sort((a, b) => a - b));
  check('vinculo inativo nao permite selecionar Filial', (await req('GET', '/alunos', { session: alvoDepois, unit: filial })).status, 403);
  async function auditar(acao, id) {
    const [row] = await consultar(db,
      'SELECT actor_id, tenant_id, unit_id, metadata_json FROM audit_log WHERE action = ? AND record_id = ? ORDER BY id DESC LIMIT 1',
      [acao, String(id)]);
    return row;
  }
  const [emissao, descontoAuditado, reabertura, desativacao] = await Promise.all([
    auditar('emitir_mensalidade_padrao', cobranca.id),
    auditar('conceder_desconto_excepcional', cobranca.id),
    auditar('reabrir_periodo', reaberto.json.id),
    auditar('desativar_vinculo_unidade', alvo.usuario.id),
  ]);
  const tenant = owner.usuario.allowedUnits.find((unit) => unit.id === matriz).tenant_id;
  check('auditoria identifica a recepcao na emissao', [emissao.actor_id, emissao.tenant_id, emissao.unit_id], [String(recepcao.usuario.id), tenant, matriz]);
  check('auditoria de desconto identifica financeiro, unidade e motivo',
    [descontoAuditado.actor_id, descontoAuditado.unit_id, JSON.parse(descontoAuditado.metadata_json).motivo],
    [String(financeiro.usuario.id), matriz, pedidoDesconto.motivo]);
  check('auditoria de reabertura identifica dono, unidade e motivo',
    [reabertura.actor_id, reabertura.unit_id, JSON.parse(reabertura.metadata_json).motivo],
    [String(owner.usuario.id), filial, 'Conferencia L02']);
  check('auditoria identifica admin e Filial na desativacao', [desativacao.actor_id, desativacao.tenant_id, desativacao.unit_id],
    [String(admin.usuario.id), tenant, filial]);
  console.log(`L02: ${total}/${total}`);
}
async function executar() {
  if (!dbPath) throw new Error('Informe --db com o SQLite descartavel usado pela API');
  const db = new sqlite.Database(dbPath, sqlite.OPEN_READONLY);
  try {
    await consultar(db, 'SELECT id FROM mensalidade LIMIT 1');
    await verificarDiagnosticoHttp();
    await main(db);
  } finally {
    db.close();
  }
}

executar().catch((error) => {
  console.error(`[FALHOU] ${error.message}`);
  for (const context of httpTrace.slice(-8)) console.error(`[HTTP] ${context}`);
  process.exitCode = 1;
});
