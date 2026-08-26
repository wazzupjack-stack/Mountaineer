const express = require('express');
const { pool } = require('../db');
const { hashPassword, verifyPassword } = require('./passwords');
const { serializeCookie, clearCookie, createSession, destroySession, resolveSession } = require('./session');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const lastTopUp = new Map(); // userId -> timestamp, in-memory faucet cooldown

function publicUser(row) {
  return { id: row.id, username: row.username, balance: Number(row.balance) };
}

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!USERNAME_RE.test(username || '')) {
    return res.status(400).json({ error: 'invalid_username', message: 'Username must be 3-20 letters, numbers, or underscores.' });
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email', message: 'Enter a valid email address.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'invalid_password', message: 'Password must be at least 8 characters.' });
  }
  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id, username, balance',
      [username, email.toLowerCase(), passwordHash]
    );
    const token = await createSession(rows[0].id);
    res.setHeader('Set-Cookie', serializeCookie(token));
    res.json(publicUser(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'already_exists', message: 'That username or email is already taken.' });
    }
    console.error('signup error', err);
    res.status(500).json({ error: 'server_error', message: 'Could not create account.' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'invalid_credentials', message: 'Enter a username and password.' });
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect username or password.' });
  }
  const token = await createSession(rows[0].id);
  res.setHeader('Set-Cookie', serializeCookie(token));
  res.json(publicUser(rows[0]));
});

router.post('/logout', async (req, res) => {
  const session = await resolveSession(req);
  if (session) await destroySession(session.token);
  res.setHeader('Set-Cookie', clearCookie());
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  const session = await resolveSession(req);
  if (!session) return res.status(401).json({ error: 'auth_required' });
  res.json({ id: session.userId, username: session.username, balance: session.balance });
});

router.post('/topup', async (req, res) => {
  const session = await resolveSession(req);
  if (!session) return res.status(401).json({ error: 'auth_required' });
  const last = lastTopUp.get(session.userId) || 0;
  const cooldownMs = 5 * 60 * 1000;
  if (Date.now() - last < cooldownMs) {
    return res.status(429).json({ error: 'cooldown', message: 'Faucet is on cooldown — try again in a few minutes.' });
  }
  lastTopUp.set(session.userId, Date.now());
  const { rows } = await pool.query(
    'UPDATE users SET balance = balance + 1000 WHERE id=$1 RETURNING balance',
    [session.userId]
  );
  res.json({ balance: Number(rows[0].balance) });
});

module.exports = router;
