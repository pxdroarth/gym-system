const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Caminho do seu arquivo .db
const dbPath = path.resolve(__dirname, 'academia.sqlite'); // ajuste se necessário

// Cria a instância do banco em modo SERIALIZE
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('❌Erro ao conectar ao banco:', err.message);
  } else {
    console.log('✅Banco conectado com sucesso.');
  }
});

// Força execução serializada
db.serialize();

module.exports = db;
