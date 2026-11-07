const db = require('./database'); // seu arquivo que abre a conexão SQLite

const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const runGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const runExecute = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, lastID: this.lastID, changes: this.changes });
    });
  });

// O app usa uma unica conexao SQLite. Sem fila, duas requisicoes simultaneas
// tentam BEGIN na mesma conexao ("cannot start a transaction within a
// transaction") e os comandos de uma entram na transacao da outra. A fila
// abaixo serializa as transacoes do processo (GS-07 P1). Leituras e escritas
// fora de runTransaction continuam sem fila.
const { AsyncLocalStorage } = require('async_hooks');

const transacaoAtual = new AsyncLocalStorage();
let filaTransacoes = Promise.resolve();

const executarTransacao = async (callback) => {
  await runExecute('BEGIN IMMEDIATE TRANSACTION');

  const tx = {
    all: runQuery,
    get: runGet,
    run: runExecute,
  };

  try {
    const result = await transacaoAtual.run(true, () => callback(tx));
    await runExecute('COMMIT');
    return result;
  } catch (error) {
    try {
      await runExecute('ROLLBACK');
    } catch (rollbackError) {
      console.error('[ERRO ROLLBACK]', rollbackError);
    }
    throw error;
  }
};

const runTransaction = (callback) => {
  if (transacaoAtual.getStore()) {
    // Mesmo comportamento de antes (o SQLite recusava BEGIN aninhado), mas
    // sem travar a fila: passe o `tx` recebido para a funcao interna.
    return Promise.reject(new Error('runTransaction aninhado: reutilize o tx da transacao atual'));
  }
  const execucao = filaTransacoes.then(() => executarTransacao(callback));
  filaTransacoes = execucao.catch(() => {});
  return execucao;
};

module.exports = { runQuery, runGet, runExecute, runTransaction };
