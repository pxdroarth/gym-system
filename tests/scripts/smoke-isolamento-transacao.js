// Smoke GS-07 P1.1: isolamento entre a transacao e as demais gravacoes.
//
// Roda em processo, contra o banco configurado em backend/database.js
// (backend/academia.sqlite). Use base DESCARTAVEL. O teste usa apenas a
// tabela temporaria `smoke_isolamento_tx`, criada e removida por ele.
//
// Uso:
//   node tests/scripts/smoke-isolamento-transacao.js
//
// Roteiro deterministico (sem depender de corrida entre requisicoes):
//   1. abre uma transacao e grava uma linha dentro dela;
//   2. com a transacao aberta, dispara uma gravacao independente (fora do
//      contexto da transacao, como faria outra requisicao);
//   3. confirma que a gravacao independente nao entrou na transacao: ela fica
//      esperando a trava e a linha da transacao nao aparece fora dela;
//   4. forca o rollback da transacao;
//   5. a gravacao independente persiste; a linha da transacao, nao.
// Tambem cobre: leitura global dentro da transacao ve as proprias gravacoes,
// trabalho agendado que roda apos o commit nao entra na transacao seguinte,
// transacoes simultaneas sao serializadas e BEGIN aninhado e recusado.

const path = require('path');

const backend = path.join(__dirname, '..', '..', 'backend');
const db = require(path.join(backend, 'database'));
const dbHelper = require(path.join(backend, 'dbHelper'));

const { runExecute, runGet, runTransaction } = dbHelper;
const TABELA = 'smoke_isolamento_tx';

let falhas = 0;
let total = 0;
function check(label, cond, extra = '') {
  total += 1;
  if (!cond) falhas += 1;
  console.log(`${cond ? '[OK]     ' : '[FALHOU] '}${label}${extra ? ` - ${extra}` : ''}`);
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function portao() {
  let abrir;
  const promessa = new Promise((resolve) => { abrir = resolve; });
  return { promessa, abrir };
}

function acompanhar(promessa) {
  const estado = { concluida: false, erro: null, valor: undefined };
  estado.promessa = promessa.then(
    (valor) => { estado.concluida = true; estado.valor = valor; return valor; },
    (erro) => { estado.concluida = true; estado.erro = erro; return null; }
  );
  return estado;
}

async function contar(origem) {
  const row = await runGet(`SELECT COUNT(*) AS total FROM ${TABELA} WHERE origem = ?`, [origem]);
  return Number(row?.total || 0);
}

(async () => {
  await runExecute(`DROP TABLE IF EXISTS ${TABELA}`);
  await runExecute(`CREATE TABLE ${TABELA} (id INTEGER PRIMARY KEY AUTOINCREMENT, origem TEXT NOT NULL)`);

  // ---------- 1 a 5: rollback nao leva a gravacao independente ----------
  const aberta = portao();
  const liberar = portao();
  const transacao = acompanhar(runTransaction(async (tx) => {
    await tx.run(`INSERT INTO ${TABELA} (origem) VALUES ('transacao')`);
    aberta.abrir();
    await liberar.promessa;
    throw new Error('rollback forcado pelo smoke');
  }));

  await aberta.promessa;
  // Chamada fora do callback: mesmo caminho de outra requisicao HTTP.
  const independente = acompanhar(runExecute(`INSERT INTO ${TABELA} (origem) VALUES ('independente')`));
  await esperar(300);
  check('com a transacao aberta, a gravacao independente espera a trava (nao entrou na transacao)',
    !independente.concluida, independente.concluida ? 'concluiu dentro da transacao' : 'aguardando');

  liberar.abrir();
  await transacao.promessa;
  await independente.promessa;
  check('a transacao terminou em rollback', transacao.erro?.message === 'rollback forcado pelo smoke', transacao.erro?.message || 'sem erro');
  check('a gravacao independente concluiu sem erro', independente.concluida && !independente.erro, independente.erro?.message || '');
  const nIndependente = await contar('independente');
  const nTransacao = await contar('transacao');
  check('a gravacao independente persistiu apos o rollback', nIndependente === 1, `independente=${nIndependente}`);
  check('a gravacao da transacao foi desfeita', nTransacao === 0, `transacao=${nTransacao}`);

  // ---------- leitura fora da transacao nao ve dado nao confirmado ----------
  const aberta2 = portao();
  const liberar2 = portao();
  const tx2 = acompanhar(runTransaction(async (tx) => {
    await tx.run(`INSERT INTO ${TABELA} (origem) VALUES ('nao_confirmada')`);
    // Funcao global chamada dentro do callback usa a conexao da transacao.
    const dentro = await runGet(`SELECT COUNT(*) AS total FROM ${TABELA} WHERE origem = 'nao_confirmada'`);
    aberta2.abrir(Number(dentro?.total || 0));
    await liberar2.promessa;
  }));
  const vistoDentro = await aberta2.promessa;
  const vistoFora = await contar('nao_confirmada');
  check('dentro da transacao, runGet global ve a propria gravacao', vistoDentro === 1, `${vistoDentro}`);
  check('fora da transacao, a gravacao ainda nao confirmada nao aparece', vistoFora === 0, `${vistoFora}`);
  liberar2.abrir();
  await tx2.promessa;
  check('apos o commit, a gravacao aparece fora', (await contar('nao_confirmada')) === 1);

  // ---------- trabalho tardio nao entra na transacao seguinte ----------
  const tardiaFeita = portao();
  await runTransaction(async (tx) => {
    await tx.run(`INSERT INTO ${TABELA} (origem) VALUES ('com_tardia')`);
    setTimeout(() => {
      runExecute(`INSERT INTO ${TABELA} (origem) VALUES ('tardia')`).then(tardiaFeita.abrir, tardiaFeita.abrir);
    }, 100);
  });
  const tx3 = acompanhar(runTransaction(async (tx) => {
    await tx.run(`INSERT INTO ${TABELA} (origem) VALUES ('segunda')`);
    await esperar(400);
    throw new Error('rollback da segunda');
  }));
  await tx3.promessa;
  await tardiaFeita.promessa;
  check('gravacao agendada na 1a transacao, executada durante a 2a, sobrevive ao rollback da 2a',
    (await contar('tardia')) === 1 && (await contar('segunda')) === 0,
    `tardia=${await contar('tardia')} segunda=${await contar('segunda')}`);

  // ---------- serializacao e aninhamento ----------
  const simultaneas = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => runTransaction(async (tx) => {
    await tx.run(`INSERT INTO ${TABELA} (origem) VALUES (?)`, [`simultanea_${i}`]);
    await esperar(5);
    return i;
  })));
  const ok = simultaneas.filter((r) => r.status === 'fulfilled').length;
  const linhas = await runGet(`SELECT COUNT(*) AS total FROM ${TABELA} WHERE origem LIKE 'simultanea_%'`);
  check('8 transacoes simultaneas: todas confirmadas, sem "transaction within a transaction"', ok === 8 && Number(linhas.total) === 8,
    `${ok} ok, ${linhas.total} linhas; ${simultaneas.filter((r) => r.status === 'rejected').map((r) => r.reason?.message).join(' | ')}`);

  const aninhada = await runTransaction(async () => {
    try {
      await runTransaction(async () => null);
      return 'aceitou';
    } catch (error) {
      return error.message;
    }
  });
  check('runTransaction aninhado e recusado com mensagem clara', /aninhado/.test(aninhada), aninhada);

  await runExecute(`DROP TABLE IF EXISTS ${TABELA}`);
  if (dbHelper.fecharConexaoTransacional) await dbHelper.fecharConexaoTransacional();
  console.log(`\n[smoke-isolamento] ${total - falhas}/${total} verificacoes OK`);
  db.close(() => process.exit(falhas ? 1 : 0));
})().catch((error) => {
  console.error('[ERRO]', error);
  process.exit(1);
});
