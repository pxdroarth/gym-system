const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const raw = String(password || '');
  if (!raw) throw new Error('Senha obrigatoria');

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scrypt(raw, salt, KEY_LENGTH);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;

  const [algorithm, salt, hashHex] = String(storedHash).split('$');
  if (algorithm !== 'scrypt' || !salt || !hashHex) return false;

  const storedBuffer = Buffer.from(hashHex, 'hex');
  const derivedKey = await scrypt(String(password), salt, storedBuffer.length);

  if (storedBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(storedBuffer, derivedKey);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  hashPassword,
  verifyPassword,
  hashToken,
  generateToken,
};
