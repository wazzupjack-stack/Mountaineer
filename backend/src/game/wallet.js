const { pool, withTransaction } = require('../db');

// The only place account balance is ever mutated. Debit is a single guarded
// UPDATE so two concurrent overspend attempts on the same account (e.g. two
// tabs of one login) can't both succeed — only one row satisfies the WHERE.
async function debit(userId, amount) {
  const { rows } = await pool.query(
    'UPDATE users SET balance = balance - $2 WHERE id=$1 AND balance >= $2 RETURNING balance',
    [userId, amount]
  );
  if (!rows.length) return null;
  return Number(rows[0].balance);
}

async function credit(userId, amount) {
  if (amount <= 0) return null;
  const { rows } = await pool.query(
    'UPDATE users SET balance = balance + $2 WHERE id=$1 RETURNING balance',
    [userId, amount]
  );
  return rows.length ? Number(rows[0].balance) : null;
}

async function getBalance(userId) {
  const { rows } = await pool.query('SELECT balance FROM users WHERE id=$1', [userId]);
  return rows.length ? Number(rows[0].balance) : null;
}

module.exports = { debit, credit, getBalance, withTransaction };
