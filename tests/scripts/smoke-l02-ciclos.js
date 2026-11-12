// Rode na copia descartavel semeada. Este smoke chama o servico real do
// backend e usa o SQLite dessa copia. Nao sobe uma segunda instancia da API.
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const datas = require('../../backend/utils/dataLocal');

// Injeta o instante somente no relogio de negocio deste processo.
// A conversao para a data civil continua usando o codigo de producao.
let agora;
const dataLocalISO = datas.dataLocalISO;
mock.method(datas, 'dataLocalISO', () => dataLocalISO(agora, 'America/Sao_Paulo'));

const db = require('../../backend/database');
const { runGet, runQuery, runExecute, runTransaction, fecharConexaoTransacional } = require('../../backend/dbHelper');
const { atualizarMensalidade, emitirMensalidadePadrao, removerMensalidade, registrarPagamento, prepararMensalidadePadrao, gravarMensalidadePadrao } = require('../../backend/services/MensalidadeService');
const { avaliarAcessoAluno } = require('../../backend/services/AccessService');
const { sincronizarFinanceiro } = require('../../backend/services/FinanceiroService');

let total = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  total++;
  console.log(`[OK] ${label}`);
}

async function main() {
  const scope = await runGet(`
    SELECT u.id AS unit_id, u.tenant_id
    FROM unit u JOIN tenant t ON t.id = u.tenant_id
    WHERE t.documento = 'bootstrap-local' AND u.codigo = 'matriz'`);
  assert.ok(scope, 'Matriz sintetica ausente: rode o seed na copia descartavel');
  const actor = { id: 'smoke-l02-ciclos', name: 'Smoke L02 ciclos', role: 'recepcao', ...scope };
  const plano = await runExecute(`
    INSERT INTO plano (nome, valor_base, duracao_em_dias, tipo_cobranca, desconto_percentual, tenant_id)
    VALUES ('Smoke L02 ciclo R$ 100', 100, 30, 'AVULSO_MENSAL', 0, ?)`, [scope.tenant_id]);

  async function aluno(nome) {
    const result = await runExecute(`
      INSERT INTO aluno (matricula, nome, status, dia_vencimento, plano_id, data_nascimento, tenant_id, unit_id)
      VALUES ((SELECT COALESCE(MAX(matricula), 1000) + 1 FROM aluno WHERE tenant_id = ? AND unit_id = ?),
        ?, 'ativo', 31, ?, '1990-01-01', ?, ?)`,
    [scope.tenant_id, scope.unit_id, nome, plano.lastID, scope.tenant_id, scope.unit_id]);
    return result.lastID;
  }

  async function emitir(id, instante) {
    agora = new Date(instante);
    return emitirMensalidadePadrao(id, actor, scope);
  }

  async function nova(id, label, instante, inicio, fim, centavos) {
    const { criada, mensalidade: m } = await emitir(id, instante);
    check(label, [criada, m.vencimento, m.data_inicio, m.data_fim, Math.round(m.valor_cobrado * 100), m.status],
      [true, inicio, inicio, fim, centavos, 'em_aberto']);
    return m.id;
  }

  async function reusar(id, label, instante, idEsperado) {
    const { criada, mensalidade } = await emitir(id, instante);
    check(label, [criada, mensalidade.id], [false, idEsperado]);
  }

  // D1/D3: 31/jan a 27/fev de 2025 tem 28 dias. Matrícula em 27/fev
  // cobra 1/28 de R$ 100 = R$ 3,57. 28/fev inicia um ciclo inteiro.
  const comum = await aluno('Smoke L02 fevereiro comum');
  const primeiraComum = await nova(comum, '2025: 27/02, primeira cobranca de 1/28 (R$ 3,57)',
    '2025-02-27T15:00:00Z', '2025-02-27', '2025-02-27', 357);
  await reusar(comum, '2025: 02:59Z de 28/02 ainda e 27/02 em Sao Paulo',
    '2025-02-28T02:59:00Z', primeiraComum);
  const segundaComum = await nova(comum, '2025: 03:00Z de 28/02 inicia 28/02 a 30/03 (R$ 100)',
    '2025-02-28T03:00:00Z', '2025-02-28', '2025-03-30', 10000);
  await reusar(comum, '2025: virada para 01/03 conserva o ciclo de 28/02',
    '2025-03-01T03:00:00Z', segundaComum);
  await nova(comum, '2025: 31/03 recupera a ancora 31; abril vence dia 30',
    '2025-03-31T03:00:00Z', '2025-03-31', '2025-04-29', 10000);

  const dono = { ...actor, id: 'smoke-l02-dono', name: 'Dono fixture', role: 'owner' };
  for (const { cenario, invalidar, statusOriginal, excluida } of [
    {
      cenario: 'cancelamento',
      invalidar: (id) => atualizarMensalidade(id, { status: 'cancelado' }, scope, dono),
      statusOriginal: 'cancelado',
      excluida: false,
    },
    {
      cenario: 'exclusao logica',
      invalidar: (id) => removerMensalidade(id, dono, 'Teste de reemissao', scope),
      statusOriginal: 'em_aberto',
      excluida: true,
    },
  ]) {
    const alunoReemissao = await aluno(`Smoke L02 reemissao apos ${cenario}`);
    const instante = '2025-02-27T15:00:00Z';
    const original = await nova(alunoReemissao, `${cenario}: primeira cobranca de R$ 3,57`,
      instante, '2025-02-27', '2025-02-27', 357);
    await invalidar(original);
    await sincronizarFinanceiro(scope);
    const substituta = await nova(alunoReemissao, `reemissao apos ${cenario} mantem R$ 3,57 e 27/02`,
      instante, '2025-02-27', '2025-02-27', 357);
    await reusar(alunoReemissao, `${cenario}: nova tentativa reutiliza a cobranca substituta`, instante, substituta);
    const cobrancas = await runQuery(
      'SELECT id, status, vencimento, valor_cobrado, deleted_at FROM mensalidade WHERE aluno_id = ? ORDER BY id', [alunoReemissao]);
    check(`SQLite: historico de ${cenario} preservado e apenas a substituta ativa`,
      cobrancas.map(({ id, status, vencimento, valor_cobrado, deleted_at }) => [id, status, vencimento, valor_cobrado, Boolean(deleted_at)]),
      [[original, statusOriginal, '2025-02-27', 3.57, excluida], [substituta, 'em_aberto', '2025-02-27', 3.57, false]]);
    const lancamentos = await runQuery(
      "SELECT origem_id, status, valor, data_lancamento, deleted_at FROM conta_financeira WHERE origem = 'mensalidade' AND origem_id IN (?, ?) ORDER BY id",
      [original, substituta]);
    check(`SQLite: ${cenario} preserva o lancamento baixado e apenas um a receber ativo`,
      lancamentos.map(({ origem_id, status, valor, data_lancamento, deleted_at }) => [origem_id, status, valor, data_lancamento, Boolean(deleted_at)]),
      [[original, 'pendente', 3.57, '2025-02-27', true], [substituta, 'pendente', 3.57, '2025-02-27', false]]);
    const pagamentos = await runQuery('SELECT id FROM pagamento WHERE mensalidade_id IN (?, ?)', [original, substituta]);
    check(`SQLite: ${cenario} e reemissao nao criam pagamento`, pagamentos.length, 0);
  }

  // Em 2024, 31/jan a 28/fev tem 29 dias. Matrícula em 28/fev
  // cobra 1/29 de R$ 100 = R$ 3,45. 29/fev inicia o próximo ciclo.
  const bissexto = await aluno('Smoke L02 fevereiro bissexto');
  const primeiraBissexto = await nova(bissexto, '2024: 28/02, primeira cobranca de 1/29 (R$ 3,45)',
    '2024-02-28T15:00:00Z', '2024-02-28', '2024-02-28', 345);
  await reusar(bissexto, '2024: 02:59Z de 29/02 ainda e 28/02 em Sao Paulo',
    '2024-02-29T02:59:00Z', primeiraBissexto);
  const segundaBissexto = await nova(bissexto, '2024: 03:00Z de 29/02 inicia 29/02 a 30/03 (R$ 100)',
    '2024-02-29T03:00:00Z', '2024-02-29', '2024-03-30', 10000);
  await reusar(bissexto, '2024: virada para 01/03 conserva o ciclo de 29/02',
    '2024-03-01T03:00:00Z', segundaBissexto);
  await nova(bissexto, '2024: 31/03 recupera a ancora 31 depois do dia 29',
    '2024-03-31T03:00:00Z', '2024-03-31', '2024-04-29', 10000);

  for (const [label, id, vencimentos] of [
    ['ano comum', comum, ['2025-02-27', '2025-02-28', '2025-03-31']],
    ['ano bissexto', bissexto, ['2024-02-28', '2024-02-29', '2024-03-31']],
  ]) {
    const rows = await runQuery('SELECT vencimento FROM mensalidade WHERE aluno_id = ? ORDER BY id', [id]);
    check(`SQLite: ${label}, uma cobranca por ciclo, inclusive duas no mesmo fevereiro`,
      rows.map(({ vencimento }) => vencimento), vencimentos);
  }
  const configurar = (politica) => runExecute('UPDATE unit SET politica_retorno_mensal = ? WHERE id = ?', [politica, scope.unit_id]);
  const receber = (mensalidade_id, valor_pago) => registrarPagamento({ mensalidade_id, valor_pago }, actor, scope);
  const consultarEntrada = (id) => avaliarAcessoAluno(id, { scope, agora });
  const unidadeAntes = await runGet('SELECT politica_retorno_mensal FROM unit WHERE id = ?', [scope.unit_id]);
  const retorno = [];
  try {
    for (const [politica, valor, inicio] of [
      [null, 8387, '2026-01-15'],
      ['integral', 10000, '2026-01-10'],
    ]) {
      const id = await aluno(`Smoke L03 retorno ${politica || 'sem configuracao'}`);
      await runExecute('UPDATE aluno SET dia_vencimento = 10 WHERE id = ?', [id]);
      agora = new Date('2025-11-10T15:00:00Z');
      const anterior = await emitirMensalidadePadrao(id, actor, scope);
      await receber(anterior.mensalidade.id, 100);
      await configurar(politica);
      agora = new Date('2026-01-15T15:00:00Z');
      const { preview } = await runTransaction((tx) => prepararMensalidadePadrao(id, scope, tx, { renovar: true }));
      check(`retorno ${politica || 'padrao'}: previa, valor e cobertura`,
        [Math.round(preview.valor_cobrado * 100), preview.data_inicio, preview.data_fim, preview.proximo_vencimento, preview.politica],
        [valor, inicio, '2026-02-09', '2026-02-10', politica ? 'retorno_integral' : 'retorno_proporcional']);
      const emitida = await emitirMensalidadePadrao(id, actor, scope, preview);
      retorno.push([id, emitida.mensalidade]);
      const rows = await runQuery('SELECT id FROM mensalidade WHERE aluno_id = ?', [id]);
      check('retorno em janeiro nao gera o ciclo ausente de dezembro', rows.length, 2);
    }

    const [id, cobranca] = retorno[0];
    const reuso = await emitirMensalidadePadrao(id, actor, scope);
    check('trocar para integral preserva ID, valor e datas da cobranca proporcional emitida',
      [reuso.criada, reuso.mensalidade.id, reuso.mensalidade.valor_cobrado, reuso.mensalidade.data_inicio, reuso.mensalidade.data_fim],
      [false, cobranca.id, 83.87, '2026-01-15', '2026-02-09']);
    await configurar('proporcional');
    const [idIntegral, integral] = retorno[1];
    const reusoIntegral = await emitirMensalidadePadrao(idIntegral, actor, scope);
    check('trocar para proporcional preserva a cobranca integral emitida',
      [reusoIntegral.criada, reusoIntegral.mensalidade.id, reusoIntegral.mensalidade.valor_cobrado],
      [false, integral.id, 100]);

    agora = new Date('2026-01-16T01:30:00Z');
    const parcial = await receber(cobranca.id, 50);
    check('pagamento na virada UTC usa 15/01 em Sao Paulo e deixa saldo de R$ 33,87',
      [parcial.data_pagamento, parcial.saldo_em_aberto, (await consultarEntrada(id)).resultado],
      ['2026-01-15', 33.87, 'negado']);
    await receber(cobranca.id, 33.87);
    check('quitacao permite entrada no ciclo vigente', (await consultarEntrada(id)).resultado, 'permitido');
    const futura = await runTransaction(async (tx) => {
      const proposta = await prepararMensalidadePadrao(id, scope, tx, { renovar: true });
      check('com cobertura paga so oferece o proximo ciclo',
        [proposta.preview.data_inicio, proposta.preview.data_fim, proposta.preview.valor_cobrado],
        ['2026-02-10', '2026-03-09', 100]);
      return gravarMensalidadePadrao(proposta, actor, scope, tx);
    });
    const proxima = await runTransaction((tx) => prepararMensalidadePadrao(id, scope, tx, { renovar: true }));
    check('previa de renovacao reutiliza a cobranca seguinte ja emitida', proxima.existente.id, futura.mensalidade.id);
    agora = new Date('2026-02-10T02:59:00Z');
    check('ultimo minuto do ciclo pago ainda libera', (await consultarEntrada(id)).resultado, 'permitido');
    agora = new Date('2026-02-10T03:00:00Z');
    check('virada da vigencia bloqueia se o novo ciclo esta aberto', (await consultarEntrada(id)).resultado, 'negado');
    await receber(futura.mensalidade.id, 100);
    check('quitacao do proximo ciclo libera na virada', (await consultarEntrada(id)).resultado, 'permitido');

    for (const [data, resultado] of [['2026-11-15', 'permitido'], ['2026-12-11', 'negado']]) {
      const alunoAtraso = await aluno(`Smoke L03 atraso ${data}`);
      await runExecute('UPDATE aluno SET dia_vencimento = 10 WHERE id = ?', [alunoAtraso]);
      agora = new Date('2026-11-10T15:00:00Z');
      const { mensalidade } = await emitirMensalidadePadrao(alunoAtraso, actor, scope);
      agora = new Date(`${data}T15:00:00Z`);
      const pagamento = await receber(mensalidade.id, 100);
      const datas = await runGet('SELECT vencimento, data_inicio, data_fim FROM mensalidade WHERE id = ?', [mensalidade.id]);
      check(`quitacao em ${data} preserva competencia e usa data real de recebimento`,
        [datas.vencimento, datas.data_inicio, datas.data_fim, pagamento.data_pagamento, (await consultarEntrada(alunoAtraso)).resultado],
        ['2026-11-10', '2026-11-10', '2026-12-09', data, resultado]);
    }
  } finally {
    await configurar(unidadeAntes.politica_retorno_mensal);
  }
  console.log(`L02/L03 ciclos: ${total}/${total}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  mock.restoreAll();
  await fecharConexaoTransacional();
  await new Promise((resolve) => db.close(resolve));
});
