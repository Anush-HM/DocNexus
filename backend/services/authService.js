// backend/services/authService.js
// ─────────────────────────────────────────────
//  Accounts without extra dependencies: scrypt password hashing and HMAC-signed tokens
//  (Node's built-in crypto only).
// ─────────────────────────────────────────────

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOKEN_DAYS = 30;

let SECRET = null;
function getSecret() {
  if (SECRET) return SECRET;
  if (process.env.JWT_SECRET) return (SECRET = process.env.JWT_SECRET);
  // No secret configured: create one once and keep it, so logins survive restarts.
  const file = path.join(__dirname, '..', '.jwt-secret');
  try {
    SECRET = fs.readFileSync(file, 'utf8').trim();
  } catch (e) {
    SECRET = crypto.randomBytes(48).toString('hex');
    try { fs.writeFileSync(file, SECRET, { mode: 0o600 }); } catch (err) { console.warn('[auth] could not save .jwt-secret; logins reset on restart'); }
  }
  return SECRET;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [saltHex, hashHex] = String(stored).split(':');
    const hash = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(hashHex, 'hex');
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch (e) {
    return false;
  }
}

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');

function signToken(userId) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub: String(userId), exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400 });
  return `${head}.${body}.${sign(`${head}.${body}`)}`;
}

function verifyToken(token) {
  try {
    const [h, b, s] = String(token).split('.');
    if (!h || !b || !s) return null;
    const expected = sign(`${h}.${b}`);
    if (s.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (!payload.sub || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/** Express middleware: requires "Authorization: Bearer <token>". Sets req.userId. */
function requireAuth(req, res, next) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  const payload = m && verifyToken(m[1]);
  if (!payload) return res.status(401).json({ error: 'Please sign in.' });
  req.userId = payload.sub;
  next();
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, requireAuth };
