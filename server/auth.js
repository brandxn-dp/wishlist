import crypto from 'node:crypto';
import { get, run, now } from './db.js';

const COOKIE = 'wl_session';
const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(expected, actual);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(userId, kind = 'session', name = null) {
  const token = (kind === 'api' ? 'wl_' : '') + crypto.randomBytes(32).toString('base64url');
  run(
    'INSERT INTO sessions (token_hash, user_id, kind, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)',
    sha256(token), userId, kind, name, now(), now(),
  );
  return token;
}

export function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function tokenFrom(req) {
  const auth = req.get('authorization');
  if (auth?.startsWith('Bearer ')) return { token: auth.slice(7).trim(), bearer: true };
  const token = parseCookies(req.get('cookie'))[COOKIE];
  return token ? { token, bearer: false } : null;
}

export function setSessionCookie(req, res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: 1000 * 60 * 60 * 24 * 365,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function userFromToken(token) {
  const row = get(
    `SELECT u.*, s.kind AS session_kind, s.last_used_at FROM sessions s
     JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row) return null;
  // Avoid a write on every request: only bump last_used_at once a minute.
  if (!row.last_used_at || now() - row.last_used_at > 60_000) {
    run('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?', now(), sha256(token));
  }
  return row;
}

export function requireAuth(req, res, next) {
  const t = tokenFrom(req);
  const user = t && userFromToken(t.token);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  // Cookie-authenticated writes must carry a custom header, which cross-site forms cannot send.
  if (!t.bearer && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-wishlist') !== '1') {
    return res.status(403).json({ error: 'Missing request header' });
  }
  req.user = user;
  req.token = t.token;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admins only' });
  next();
}

// Tiny in-memory limiter for login attempts.
const attempts = new Map();
export function loginLimiter(req, res, next) {
  const key = req.ip;
  const entry = attempts.get(key) || { count: 0, reset: now() + 15 * 60_000 };
  if (entry.reset < now()) Object.assign(entry, { count: 0, reset: now() + 15 * 60_000 });
  entry.count++;
  attempts.set(key, entry);
  if (entry.count > 20) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  next();
}
