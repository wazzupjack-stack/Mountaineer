const crypto = require('crypto');
const cookie = require('cookie');
const { pool } = require('../db');

const COOKIE_NAME = 'sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function serializeCookie(token) {
  return cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

function clearCookie() {
  return cookie.serialize(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
    [token, userId, expiresAt]
  );
  return token;
}

async function destroySession(token) {
  if (!token) return;
  await pool.query('DELETE FROM sessions WHERE id=$1', [token]);
}

// Works against both an Express `req` and a raw http.IncomingMessage
// (the WS upgrade request), since both just expose `headers.cookie`.
async function resolveSession(req) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  const parsed = cookie.parse(raw);
  const token = parsed[COOKIE_NAME];
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.balance
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id=$1 AND s.expires_at > now()`,
    [token]
  );
  if (!rows.length) return null;
  return { token, userId: rows[0].id, username: rows[0].username, balance: Number(rows[0].balance) };
}

module.exports = { serializeCookie, clearCookie, createSession, destroySession, resolveSession, COOKIE_NAME };
