const { pool } = require('../db');
const { MOUNTAINS } = require('../config/mountains');
const { Room } = require('./room');

async function createRooms() {
  const ambientBotsEnabled = process.env.AMBIENT_BOTS_ENABLED !== 'false';
  // DEMO ONLY — off unless explicitly turned on; see Room's displayJackpot()
  // for what this actually does and why it's safe to leave on by accident
  // (it never touches real money or the database either way).
  const demoBoostEnabled = process.env.DEMO_JACKPOT_BOOST_ENABLED === 'true';
  const { rows } = await pool.query('SELECT mountain_id, progress_m, jackpot, nonce FROM mountain_state');
  const stateById = Object.fromEntries(rows.map(r => [r.mountain_id, r]));

  const rooms = new Map();
  for (const cfg of MOUNTAINS) {
    const initial = stateById[cfg.id] || { progress_m: 0, jackpot: 0, nonce: 0 };
    const room = new Room(cfg, initial, { ambientBotsEnabled, demoBoostEnabled });
    rooms.set(cfg.id, room);
  }
  for (const room of rooms.values()) room.start();
  return rooms;
}

module.exports = { createRooms };
