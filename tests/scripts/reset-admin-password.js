#!/usr/bin/env node
const readline = require('readline');
const { hashPassword } = require('../../backend/utils/passwordHash');

let db = null;

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY || !stdout.isTTY) {
      reject(new Error('Terminal interativo (TTY) obrigatorio para entrada segura da senha'));
      return;
    }

    let value = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (char) => {
      const key = String(char || '');

      if (key === '\u0003') {
        cleanup();
        reject(new Error('Operacao cancelada'));
        return;
      }

      if (key === '\r' || key === '\n') {
        stdout.write('\n');
        cleanup();
        resolve(value);
        return;
      }

      if (key === '\u0008' || key === '\u007f') {
        value = value.slice(0, -1);
        return;
      }

      if (key >= ' ') {
        value += key;
      }
    };

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    stdin.on('data', onData);
  });
}

async function askLogin(initialLogin) {
  if (initialLogin) return String(initialLogin).trim();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const login = await new Promise((resolve) => {
    rl.question('Login do usuario interno/admin: ', resolve);
  });
  rl.close();
  return String(login || '').trim();
}

async function revokeAuthArtifactsByUser(tx, userId) {
  await tx.run(
    `UPDATE auth_session
     SET status = 'revogado',
         revoked_at = COALESCE(revoked_at, datetime('now'))
     WHERE usuario_id = ?
       AND status = 'ativo'`,
    [userId]
  );

  await tx.run(
    `UPDATE auth_refresh_token
     SET status = 'revogado',
         revoked_at = COALESCE(revoked_at, datetime('now'))
     WHERE usuario_id = ?
       AND status IN ('ativo', 'rotacionado')
       AND revoked_at IS NULL`,
    [userId]
  );
}

async function main() {
  const loginInput = process.argv[2];
  const login = await askLogin(loginInput);

  if (!login) {
    throw new Error('Login obrigatorio');
  }

  const senha = await askHidden('Nova senha: ');
  if (!senha) {
    throw new Error('Senha nao pode ser vazia');
  }

  const confirmacao = await askHidden('Confirmar nova senha: ');
  if (!confirmacao) {
    throw new Error('Confirmacao de senha obrigatoria');
  }

  if (senha !== confirmacao) {
    throw new Error('As senhas nao conferem');
  }

  // Abre a conexao somente depois que os prompts sensiveis terminam.
  db = require('../../backend/database');
  const { runGet, runTransaction } = require('../../backend/dbHelper');

  const user = await runGet(
    `SELECT id, login, email
     FROM usuario_interno
     WHERE LOWER(login) = LOWER(?)
        OR LOWER(email) = LOWER(?)
     LIMIT 1`,
    [login, login]
  );

  if (!user) {
    throw new Error('Usuario interno/admin nao encontrado');
  }

  const senhaHash = await hashPassword(senha);

  await runTransaction(async (tx) => {
    await tx.run(
      `UPDATE usuario_interno
       SET senha_hash = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [senhaHash, user.id]
    );

    await revokeAuthArtifactsByUser(tx, user.id);
  });

  console.log('Senha resetada com sucesso.');
}

main()
  .then(() => {
    if (!db) {
      process.exit(0);
      return;
    }
    db.close(() => process.exit(0));
  })
  .catch((error) => {
    console.error(`Erro ao resetar senha: ${error.message}`);
    if (!db) {
      process.exit(1);
      return;
    }
    db.close(() => process.exit(1));
  });
