const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'academia.sqlite');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco:', err.message);
  } else {
    console.log('Banco conectado com sucesso.');
  }
});

// Tempo de espera por trava do SQLite; vale para esta conexao e para a
// conexao dedicada das transacoes (dbHelper).
const BUSY_TIMEOUT_MS = Number(process.env.SQLITE_BUSY_TIMEOUT_MS) || 5000;
db.configure('busyTimeout', BUSY_TIMEOUT_MS);
db.dbPath = dbPath;
db.busyTimeoutMs = BUSY_TIMEOUT_MS;
db.serialize();

module.exports = db;
