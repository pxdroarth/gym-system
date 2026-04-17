const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');

const dbPath = path.resolve(__dirname, '../backend/academia.sqlite');
const backupsDir = path.resolve(__dirname, '../backups');

if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupName = `academia_backup_${timestamp}.sqlite`;
const backupPath = path.join(backupsDir, backupName);

fse.copy(dbPath, backupPath)
  .then(() => {
    console.log(`✅ Backup criado com sucesso: ${backupPath}`);
  })
  .catch((err) => {
    console.error('❌ Falha ao criar backup:', err.message);
  });