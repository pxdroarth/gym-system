const sqlite3 = require('sqlite3');
const { AsyncLocalStorage } = require('async_hooks');
const db = require('./database'); // conexao principal (comandos fora de transacao)

// Isolamento de transacoes (GS-07 P1.1)
// -------------------------------------
// As transacoes rodam numa conexao SQLite propria, separada da conexao
// principal. Antes, tudo usava uma conexao so: um comando de outra
// requisicao, emitido enquanto uma transacao estava aberta, entrava nela e
// era desfeito junto num ROLLBACK.
//
// - Dentro do callback de runTransaction (e de tudo que ele aguarda), runQuery,
//   runGet e runExecute usam a conexao da transacao, via AsyncLocalStorage.
//   Assim, codigo antigo que chama as funcoes globais dentro da transacao
//   continua vendo as proprias gravacoes.
// - Fora dela (outras requisicoes), os comandos vao para a conexao principal.
//   Uma gravacao independente espera a trava da transacao (busyTimeout) e e
//   gravada por conta propria: commit ou rollback da transacao nao a afetam.
// - Trabalho agendado dentro da transacao que roda depois do fim dela (ex.:
//   setTimeout) volta para a conexao principal, para nao entrar na transacao
//   seguinte.
// - A fila serializa as transacoes do processo; a conexao dedicada so tem uma
//   transacao por vez.

const transacaoAtual = new AsyncLocalStorage();
let conexaoTransacional = null;
let filaTransacoes = Promise.resolve();

function obterConexaoTransacional() {
  if (!conexaoTransacional) {
    const caminho = db.dbPath || db.filename;
    if (!caminho) throw new Error('dbHelper: caminho do banco desconhecido para a conexao de transacao');
    conexaoTransacional = new sqlite3.Database(caminho, sqlite3.OPEN_READWRITE);
    conexaoTransacional.configure('busyTimeout', db.busyTimeoutMs || 5000);
  }
  return conexaoTransacional;
}

function conexaoDoContexto() {
  const contexto = transacaoAtual.getStore();
  return contexto && contexto.ativa ? contexto.conexao : db;
}

const queryEm = (conexao, sql, params = []) =>
  new Promise((resolve, reject) => {
    conexao.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const getEm = (conexao, sql, params = []) =>
  new Promise((resolve, reject) => {
    conexao.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const executeEm = (conexao, sql, params = []) =>
  new Promise((resolve, reject) => {
    conexao.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, lastID: this.lastID, changes: this.changes });
    });
  });

const runQuery = (sql, params = []) => queryEm(conexaoDoContexto(), sql, params);
const runGet = (sql, params = []) => getEm(conexaoDoContexto(), sql, params);
const runExecute = (sql, params = []) => executeEm(conexaoDoContexto(), sql, params);

async function executarTransacao(callback) {
  const conexao = obterConexaoTransacional();
  const contexto = { conexao, ativa: true };
  const tx = {
    all: (sql, params) => queryEm(conexao, sql, params),
    get: (sql, params) => getEm(conexao, sql, params),
    run: (sql, params) => executeEm(conexao, sql, params),
  };

  await executeEm(conexao, 'BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = await transacaoAtual.run(contexto, () => callback(tx));
    contexto.ativa = false;
    await executeEm(conexao, 'COMMIT');
    return result;
  } catch (error) {
    contexto.ativa = false;
    try {
      await executeEm(conexao, 'ROLLBACK');
    } catch (rollbackError) {
      console.error('[ERRO ROLLBACK]', rollbackError);
    }
    throw error;
  }
}

const runTransaction = (callback) => {
  const contexto = transacaoAtual.getStore();
  if (contexto && contexto.ativa) {
    // O SQLite recusa BEGIN aninhado; reutilize o tx recebido.
    return Promise.reject(new Error('runTransaction aninhado: reutilize o tx da transacao atual'));
  }
  const execucao = filaTransacoes.then(() => executarTransacao(callback));
  filaTransacoes = execucao.catch(() => {});
  return execucao;
};

function fecharConexaoTransacional() {
  if (!conexaoTransacional) return Promise.resolve();
  const conexao = conexaoTransacional;
  conexaoTransacional = null;
  return new Promise((resolve) => conexao.close(() => resolve()));
}

module.exports = { runQuery, runGet, runExecute, runTransaction, fecharConexaoTransacional };
