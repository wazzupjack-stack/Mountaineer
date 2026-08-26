const { pool } = require('../db');
const { rnd, crashFromSeed, newServerSeed, sha256 } = require('./rng');
const { altOf, stepMult, isSummit, clamp } = require('./round');
const { credit, debit } = require('./wallet');
const { OUT } = require('../ws/protocol');

const WAIT_MS = 5000;
const FALLEN_MS = 4200;
const TICK_MS = 100;
const SYNC_MS = 180;

const NAMES = ['AlpineTrdr', 'PeakSeeker', 'SummitCall', 'RidgeRider', 'IceBreaker', 'NordicPro',
  'GlacierBull', 'SnowCap', 'K2Bull', 'CrevassePro', 'FjordCap', 'TundraFund', 'BasecampX', 'NordIce',
  'VertexBull', 'ScarpaPro', 'SteepFund', 'IcefallCap', 'CouloirQ', 'PowderDay', 'HighCamp9', 'ColdFront',
  'RopeGunQ', 'BelayBull', 'SeracTrdr', 'MoraineX', 'RouteFindr', 'ColTrader', 'BivouacX', 'DepthHoar',
  'CruxFund', 'ZeroPoint', 'WhiteoutX', 'AltiTrader', 'OxygenBull', 'CampIV', 'ThinAir', 'IceAx9'];
const pick = a => a[Math.floor(Math.random() * a.length)];

function emptySlots() { return [null, null]; }

class Room {
  constructor(cfg, initial, opts) {
    this.cfg = cfg;
    this.progress = Number(initial.progress_m) || 0;
    this.jackpot = Number(initial.jackpot) || 0;
    this.nonce = Number(initial.nonce) || 0;
    this.ambientBotsEnabled = opts.ambientBotsEnabled;

    // ─── DEMO ONLY — safe to delete this block + every this.demoBoost*
    // reference (search the file for "DEMO ONLY") once real demos are done.
    // Purely cosmetic: never persisted to the DB, never touches the real
    // this.jackpot pool that actually gets paid out, so turning the
    // DEMO_JACKPOT_BOOST_ENABLED env var back off (or just restarting the
    // container) makes every trace of it vanish instantly. See
    // displayJackpot() below for the one place it's actually used.
    this.demoBoostEnabled = !!opts.demoBoostEnabled;
    this.demoJackpotBoost = 0;

    this.phase = 'waiting';
    this.mult = 1;
    this.crashAt = null;
    this.serverSeed = null;
    this.serverSeedHash = null;
    this.clientSeed = null;
    this.phaseStartedAt = Date.now();
    this.lastSummit = false;

    this.subscribers = new Set();
    this.bets = new Map(); // ws -> [slot0, slot1], each null or {stake,autoCashout,state,cashMult,userId,username}
    this.sims = [];

    this._waitTimer = null;
    this._fallenTimer = null;
    this._tickInterval = null;
    this._syncInterval = null;
  }

  start() {
    this.startWaiting();
  }

  // ── broadcast / subscription plumbing ──────────────────────────────
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.subscribers) if (ws.readyState === 1) ws.send(data);
  }
  sendTo(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }
  broadcastSubscriberCount() {
    this.broadcast({ type: OUT.SUBSCRIBER_COUNT, mountainId: this.cfg.id, count: this.subscribers.size });
  }

  addSubscriber(ws) {
    this.subscribers.add(ws);
    this.sendTo(ws, this.snapshotFor(ws));
    this.broadcastSubscriberCount();
  }
  removeSubscriber(ws) {
    this.subscribers.delete(ws);
    this.broadcastSubscriberCount();
    // bets stay in this.bets keyed by ws even after unsubscribe/disconnect —
    // an in-flight bet still needs to settle and credit the account even if
    // the socket that placed it is gone by round end.
  }

  snapshotFor(ws) {
    const mine = this.bets.get(ws) || emptySlots();
    return {
      type: OUT.SNAPSHOT, mountainId: this.cfg.id, phase: this.phase, mult: this.mult,
      phaseStartedAt: this.phaseStartedAt, progress: this.progress, jackpot: this.displayJackpot(),
      subscriberCount: this.subscribers.size, serverSeedHash: this.serverSeedHash,
      nonce: this.nonce, clientSeed: this.clientSeed, summit: this.lastSummit,
      myBets: mine.map(b => b && { stake: b.stake, autoCashout: b.autoCashout, state: b.state, cashMult: b.cashMult }),
    };
  }

  // DEMO ONLY — the number shown to clients. Everywhere real money is
  // actually computed (jackpotBefore/totalStake/payout math in endRound)
  // must keep reading this.jackpot directly, never this method, so the
  // cosmetic boost can never be paid out to a real player.
  displayJackpot() {
    return rnd(this.jackpot + this.demoJackpotBoost);
  }

  // ── round lifecycle ─────────────────────────────────────────────────
  startWaiting() {
    this.phase = 'waiting';
    this.mult = 1;
    this.crashAt = null;
    this.sims = [];
    this.nonce += 1;
    this.serverSeed = newServerSeed();
    this.serverSeedHash = sha256(this.serverSeed);
    this.clientSeed = `${this.cfg.id}:${this.nonce}`;
    this.phaseStartedAt = Date.now();

    for (const [, slots] of this.bets) {
      for (let i = 0; i < 2; i++) {
        const b = slots[i];
        if (!b) continue;
        if (b.state === 'next') slots[i] = { ...b, state: 'queued' };
        else if (b.state === 'cashed' || b.state === 'lost') slots[i] = null;
      }
    }

    // DEMO ONLY — nudges the *displayed* pool up a bit each round, as if
    // other simulated tables were also feeding it. Never touches
    // this.jackpot, never persisted — see displayJackpot() above.
    if (this.demoBoostEnabled) this.demoJackpotBoost = rnd(this.demoJackpotBoost + 15 + Math.random() * 105);

    this.broadcast({
      type: OUT.PHASE, mountainId: this.cfg.id, phase: 'waiting', ts: this.phaseStartedAt,
      nonce: this.nonce, serverSeedHash: this.serverSeedHash, clientSeed: this.clientSeed,
      progress: this.progress, jackpot: this.displayJackpot(),
    });

    this._waitTimer = setTimeout(() => this.beginClimb(), WAIT_MS);
  }

  beginClimb() {
    this.phase = 'climbing';
    this.mult = 1;
    this.phaseStartedAt = Date.now();
    this.crashAt = crashFromSeed(this.cfg, this.serverSeed, this.clientSeed, this.nonce);

    for (const [, slots] of this.bets) {
      for (let i = 0; i < 2; i++) if (slots[i] && slots[i].state === 'queued') slots[i].state = 'live';
    }

    if (this.ambientBotsEnabled) {
      const n = 5 + Math.floor(Math.random() * 10);
      for (let i = 0; i < n; i++) {
        const r = Math.random();
        const tg = r < 0.55 ? 1.05 + Math.random() * 1.2
          : r < 0.88 ? 2.2 + Math.random() * 3.5
          : 5 + Math.random() * Math.min(this.cfg.ceiling - 5, 25);
        this.sims.push({ name: pick(NAMES), target: rnd(tg), stake: (2 + Math.floor(Math.random() * 40)) * 10, done: false });
      }
    }

    this.broadcast({ type: OUT.PHASE, mountainId: this.cfg.id, phase: 'climbing', ts: this.phaseStartedAt });

    let last = Date.now();
    this._tickInterval = setInterval(() => {
      const now = Date.now();
      const dt = Math.min((now - last) / 1000, 0.2);
      last = now;
      this.mult = stepMult(this.cfg, this.mult, dt);

      for (const s of this.sims) {
        if (!s.done && this.mult >= s.target) {
          s.done = true;
          this.broadcast({ type: OUT.CASHOUT_RESULT, mountainId: this.cfg.id, name: s.name, mult: s.target, value: rnd(s.stake * (s.target - 1)) });
        }
      }
      for (const [ws, slots] of this.bets) {
        for (let i = 0; i < 2; i++) {
          const b = slots[i];
          if (b && b.state === 'live' && b.autoCashout && this.mult >= b.autoCashout) this.cashOut(ws, i);
        }
      }

      if (this.mult >= this.crashAt) {
        this.mult = this.crashAt;
        clearInterval(this._tickInterval); this._tickInterval = null;
        clearInterval(this._syncInterval); this._syncInterval = null;
        this.endRound();
      }
    }, TICK_MS);

    this._syncInterval = setInterval(() => {
      this.broadcast({ type: OUT.SYNC, mountainId: this.cfg.id, mult: this.mult, serverTime: Date.now() });
    }, SYNC_MS);
  }

  async endRound() {
    this.phase = 'fallen';
    this.phaseStartedAt = Date.now();
    const crashAt = this.crashAt;
    const summit = isSummit(this.cfg, this.progress, crashAt);
    this.lastSummit = summit;
    const jackpotBefore = this.jackpot;

    const settledBets = []; // {userId, stake, autoCashout, cashMult, payout, refund, result}

    for (const [ws, slots] of this.bets) {
      for (let i = 0; i < 2; i++) {
        const b = slots[i];
        if (!b) continue;
        if (b.state === 'live') {
          b.state = 'lost';
          const rake = rnd(b.stake * this.cfg.rake / 100);
          const lossback = (this.cfg.lossback > 0 && crashAt < this.cfg.lbCond) ? rnd(b.stake * this.cfg.lossback / 100) : 0;
          const refund = rnd(rake + lossback);
          if (refund > 0) await credit(b.userId, refund);
          this.broadcast({ type: OUT.LOSS_RESULT, mountainId: this.cfg.id, name: b.username, stake: b.stake });
          this.sendTo(ws, { type: 'betSettled', mountainId: this.cfg.id, slot: i, result: 'lost', refund, crashAt });
          this.sendTo(ws, { type: OUT.BALANCE, balance: await currentBalance(b.userId) });
          settledBets.push({ userId: b.userId, stake: b.stake, autoCashout: b.autoCashout, cashMult: null, payout: 0, refund, result: 'lost' });
        } else if (b.state === 'cashed') {
          settledBets.push({ userId: b.userId, stake: b.stake, autoCashout: b.autoCashout, cashMult: b.cashMult, payout: b.payout, refund: 0, result: 'cashed' });
        }
      }
    }
    if (this.ambientBotsEnabled) {
      for (const s of this.sims) if (!s.done) this.broadcast({ type: OUT.LOSS_RESULT, mountainId: this.cfg.id, name: s.name, stake: s.stake });
    }

    const newProgress = summit ? (this.cfg.elev - this.cfg.base) : (altOf(this.cfg, this.progress, crashAt) - this.cfg.base);

    let jackpotPaid = 0;
    const jackpotWinners = new Map(); // ws -> won amount
    const participants = new Set(); // ws set that had ANY bet slot this round

    for (const [ws, slots] of this.bets) {
      if (slots[0] || slots[1]) participants.add(ws);
    }

    if (summit) {
      const totalStake = settledBets.reduce((s, b) => s + b.stake, 0) + this.sims.reduce((s, x) => s + x.stake, 0);
      if (jackpotBefore > 0 && totalStake > 0) {
        for (const [ws, slots] of this.bets) {
          let won = 0;
          for (let i = 0; i < 2; i++) {
            const b = slots[i];
            if (!b) continue;
            won = rnd(won + rnd(jackpotBefore * b.stake / totalStake));
          }
          if (won > 0) {
            await credit(ws.userId, won);
            jackpotWinners.set(ws, won);
            jackpotPaid = rnd(jackpotPaid + won);
          }
        }
      }
      for (const ws of participants) {
        const won = jackpotWinners.get(ws) || 0;
        this.sendTo(ws, { type: OUT.JACKPOT_WIN, mountainId: this.cfg.id, won, participated: true });
        if (won > 0) this.sendTo(ws, { type: OUT.BALANCE, balance: await currentBalance(ws.userId) });
      }
      this.progress = 0;
      this.jackpot = 0;
      this.demoJackpotBoost = 0;   // DEMO ONLY — reset alongside the real pool
    } else {
      this.progress = newProgress;
    }

    await pool.query(
      'UPDATE mountain_state SET progress_m=$2, jackpot=$3, nonce=$4, updated_at=now() WHERE mountain_id=$1',
      [this.cfg.id, this.progress, this.jackpot, this.nonce]
    );

    try {
      const { rows } = await pool.query(
        `INSERT INTO rounds (mountain_id, nonce, server_seed, server_seed_hash, client_seed, crash_at, summit, progress_after, jackpot_before, jackpot_paid, started_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [this.cfg.id, this.nonce, this.serverSeed, this.serverSeedHash, this.clientSeed, crashAt, summit, this.progress, jackpotBefore, jackpotPaid, new Date(this.phaseStartedAt)]
      );
      const roundId = rows[0].id;
      for (const b of settledBets) {
        await pool.query(
          `INSERT INTO bets (round_id, user_id, stake, auto_cashout, cash_mult, payout, refund, result, settled_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
          [roundId, b.userId, b.stake, b.autoCashout, b.cashMult, b.payout, b.refund, b.result]
        );
      }
    } catch (err) {
      console.error(`[room ${this.cfg.id}] failed to persist round`, err);
    }

    this.broadcast({
      type: OUT.ROUND_END, mountainId: this.cfg.id, nonce: this.nonce, serverSeed: this.serverSeed,
      serverSeedHash: this.serverSeedHash, clientSeed: this.clientSeed, crashAt, summit,
      progress: this.progress, jackpot: this.displayJackpot(), jackpotPaid, ts: this.phaseStartedAt,
    });

    this._fallenTimer = setTimeout(() => this.startWaiting(), FALLEN_MS);
  }

  // ── player actions ──────────────────────────────────────────────────
  async placeBet(ws, slot, stake, autoCashout) {
    if (slot !== 0 && slot !== 1) return this.sendTo(ws, { type: OUT.ERROR, code: 'bad_request', message: 'Invalid slot.' });
    if (!ws.userId) return this.sendTo(ws, { type: OUT.ERROR, code: 'auth_required', message: 'Log in to place a stake.' });
    stake = Number(stake);
    if (!(stake > 0)) return this.sendTo(ws, { type: OUT.ERROR, code: 'bad_request', message: 'Enter a stake amount.' });
    if (!this.bets.has(ws)) this.bets.set(ws, emptySlots());
    const slots = this.bets.get(ws);
    if (slots[slot]) return this.sendTo(ws, { type: OUT.ERROR, code: 'invalid_state', message: 'That slot already has a stake.' });

    const newBalance = await debit(ws.userId, stake);
    if (newBalance === null) return this.sendTo(ws, { type: OUT.ERROR, code: 'insufficient_funds', message: 'Insufficient balance.' });

    this.jackpot = rnd(this.jackpot + stake * 0.05);
    pool.query('UPDATE mountain_state SET jackpot=$2, updated_at=now() WHERE mountain_id=$1', [this.cfg.id, this.jackpot]).catch(() => {});

    const state = this.phase === 'waiting' ? 'queued' : 'next';
    slots[slot] = { stake, autoCashout: (autoCashout && autoCashout > 1.01) ? Number(autoCashout) : null, state, cashMult: null, payout: 0, userId: ws.userId, username: ws.username };

    this.sendTo(ws, { type: OUT.BALANCE, balance: newBalance });
    this.broadcast({ type: OUT.STATE, mountainId: this.cfg.id, jackpot: this.displayJackpot(), progress: this.progress });
    this.sendTo(ws, { type: 'betAccepted', mountainId: this.cfg.id, slot, stake, autoCashout: slots[slot].autoCashout, state });
  }

  async cancelBet(ws, slot) {
    const slots = this.bets.get(ws);
    const b = slots && slots[slot];
    if (!b || (b.state !== 'queued' && b.state !== 'next')) return;
    slots[slot] = null;
    const newBalance = await credit(ws.userId, b.stake);
    this.sendTo(ws, { type: OUT.BALANCE, balance: newBalance });
    this.sendTo(ws, { type: 'betCancelled', mountainId: this.cfg.id, slot });
  }

  async cashOut(ws, slot) {
    const slots = this.bets.get(ws);
    const b = slots && slots[slot];
    if (!b || b.state !== 'live' || this.phase !== 'climbing') return;
    b.state = 'cashed';
    b.cashMult = rnd(this.mult);
    const win = rnd(b.stake * b.cashMult);
    const rake = rnd(b.stake * this.cfg.rake / 100);
    b.payout = rnd(win + rake);
    const newBalance = await credit(b.userId, b.payout);
    this.sendTo(ws, { type: OUT.BALANCE, balance: newBalance });
    this.sendTo(ws, { type: 'cashOutAccepted', mountainId: this.cfg.id, slot, cashMult: b.cashMult, payout: b.payout, rake });
    this.broadcast({ type: OUT.CASHOUT_RESULT, mountainId: this.cfg.id, name: b.username, mult: b.cashMult, value: win });
  }
}

async function currentBalance(userId) {
  if (!userId) return null;
  const { rows } = await pool.query('SELECT balance FROM users WHERE id=$1', [userId]);
  return rows.length ? Number(rows[0].balance) : null;
}

module.exports = { Room };
