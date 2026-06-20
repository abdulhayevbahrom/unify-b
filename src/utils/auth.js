import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

function getSecret() {
  return process.env.AUTH_SECRET || 'sab-center-local-development-secret-change-me';
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [salt, key] = storedHash.split(':');

  if (!salt || !key) {
    return false;
  }

  const derivedKey = await scrypt(password, salt, 64);
  const storedKey = Buffer.from(key, 'hex');

  return storedKey.length === derivedKey.length && crypto.timingSafeEqual(storedKey, derivedKey);
}

export function createToken(userId) {
  const payload = encode({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
  });
  const signature = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

export function verifyToken(token) {
  const [payload, signature] = token.split('.');

  if (!payload || !signature) {
    throw new Error('Token formati noto‘g‘ri');
  }

  const expectedSignature = crypto.createHmac('sha256', getSecret()).update(payload).digest();
  const receivedSignature = Buffer.from(signature, 'base64url');

  if (
    expectedSignature.length !== receivedSignature.length
    || !crypto.timingSafeEqual(expectedSignature, receivedSignature)
  ) {
    throw new Error('Token imzosi noto‘g‘ri');
  }

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

  if (!decoded.sub || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token muddati tugagan');
  }

  return decoded;
}
