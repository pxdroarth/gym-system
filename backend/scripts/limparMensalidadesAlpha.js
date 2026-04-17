const fs = require('fs');
const path = require('path');
const db = require('../database');

const dbPath = path.join(__dirname, '..', 'academia.sqlite');
const backupDir = path.join(__dirname, '..', 'backups');

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

async function main() {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `academia-backup-antes-limpeza-mensalidades-${stamp}.sqlite`);
  fs.copyFileSync(dbPath, backupPath);

  console.log('Backup criado em:', backupPath);

  await run('BEGIN TRANSACTION');
  try {
    const contas = await run("DELETE FROM conta_financeira WHERE origem = 'mensalidade'");
    const pagamentos = await run('DELETE FROM pagamento');
    const mensalidades = await run('DELETE FROM mensalidade');
    await run('COMMIT');

    console.log('Limpeza concluída com sucesso.');
    console.log(`- conta_financeira (origem mensalidade): ${contas.changes}`);
    console.log(`- pagamentos removidos: ${pagamentos.changes}`);
    console.log(`- mensalidades removidas: ${mensalidades.changes}`);
    console.log('Alunos, planos, produtos e demais módulos foram preservados.');
  } catch (error) {
    await run('ROLLBACK');
    console.error('Erro ao limpar mensalidades:', error.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
