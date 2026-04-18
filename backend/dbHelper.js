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

const runTransaction = async (callback) => {
  await runExecute('BEGIN IMMEDIATE TRANSACTION');

  const tx = {
    all: runQuery,
    get: runGet,
    run: runExecute,
  };

  try {
    const result = await callback(tx);
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

module.exports = { runQuery, runGet, runExecute, runTransaction };
