const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const {
  runConsistencyDiagnostics,
} = require('../../backend/services/ConsistencyDiagnosticService');

function parseArgs(argv) {
  const args = {
    dbPath: path.resolve(__dirname, '../../backend/academia.sqlite'),
    exampleLimit: 5,
    jsonOnly: false,
    noFail: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--json-only') {
      args.jsonOnly = true;
    } else if (arg === '--no-fail') {
      args.noFail = true;
    } else if (arg === '--db' && argv[i + 1]) {
      args.dbPath = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--db=')) {
      args.dbPath = path.resolve(arg.slice('--db='.length));
    } else if (arg === '--examples' && argv[i + 1]) {
      args.exampleLimit = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--examples=')) {
      args.exampleLimit = Number(arg.slice('--examples='.length));
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Diagnostico read-only de consistencia operacional

Uso:
  tests\\scripts\\diagnostico-consistencia.cmd [opcoes]

Opcoes:
  --db <caminho>       Caminho do SQLite. Padrao: backend\\academia.sqlite
  --examples <n>       Limite de exemplos por check. Padrao: 5
  --json-only          Imprime apenas o payload JSON
  --no-fail            Mantem exit code 0 mesmo com achados criticos/altos
  --help               Mostra esta ajuda
`);
}

function openReadOnlyDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(db);
    });
  });
}

function closeDatabase(db) {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function createReadOnlyClient(db) {
  return {
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
          if (error) reject(error);
          else resolve(rows);
        });
      });
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  let db;
  try {
    db = await openReadOnlyDatabase(args.dbPath);
    const diagnostic = await runConsistencyDiagnostics({
      db: createReadOnlyClient(db),
      exampleLimit: args.exampleLimit,
    });

    if (!args.jsonOnly) {
      console.log(diagnostic.resumoHumano.join('\n'));
      console.log('');
      console.log('JSON estruturado:');
    }
    console.log(JSON.stringify(diagnostic.payload, null, 2));

    if (diagnostic.payload.resultado.tem_bloqueio && !args.noFail) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[FALHOU] diagnostico-consistencia - ${error.message}`);
    process.exitCode = 1;
  } finally {
    try {
      await closeDatabase(db);
    } catch (error) {
      console.error(`[FALHOU] fechamento do SQLite - ${error.message}`);
      process.exitCode = 1;
    }
  }
}

main();
