/* ═══════════════════════════════════════════════════════════════
   MOUNTAINEER · ACCOUNT
   Shared, persistent (localStorage) account state — wallet, lifetime
   stats, and loadout (avatar / climber / gear) — used by index.html,
   mountaineer.html, and loadout.html. Loaded as a plain synchronous
   <script> before each page's own script, so `Account` is always
   ready by the time page-specific game code runs.
═══════════════════════════════════════════════════════════════ */
const ACCOUNT_KEY = 'mountaineer-account-v1';
const GEAR_SLOTS = 3; // how many gear items can be equipped at once

const AVATARS = [
  { id: 'climber', icon: '🧗', name: 'Climber',  cost: 0 },
  { id: 'peak',    icon: '🏔️', name: 'Peak',     cost: 300 },
  { id: 'eagle',   icon: '🦅', name: 'Eagle',    cost: 600 },
  { id: 'wolf',    icon: '🐺', name: 'Wolf',     cost: 900 },
  { id: 'frost',   icon: '❄️', name: 'Frost',    cost: 1200 },
  { id: 'ember',   icon: '🔥', name: 'Ember',    cost: 1800 },
  { id: 'crown',   icon: '👑', name: 'Legend',   cost: 3000 }
];

// successRate: this climber's personal breakthrough chance — the odds any given round draws from
// the mountain's full baseline scale regardless of live weather (see weatherThrottle() in index.html).
// skewMult: multiplies the mountain's base climb scale directly — a general "climbs a bit further on
// average" edge, applied on both index.html's bracket game and mountaineer.html's ascent.
const CLIMBERS = [
  { id: 'novice', name: 'Novice Guide',       tier: 'STARTER',   cost: 0,     successRate: 0.08, skewMult: 1.00,
    blurb: 'Everyone starts here.' },
  { id: 'veteran', name: 'Veteran Sherpa',    tier: 'VETERAN',   cost: 1500,  successRate: 0.14, skewMult: 1.08,
    blurb: 'Years on the mountain. Knows when to push.' },
  { id: 'elite', name: 'Elite Alpinist',      tier: 'ELITE',     cost: 5000,  successRate: 0.20, skewMult: 1.15,
    blurb: 'Summited three 8000ers. Rarely turns back.' },
  { id: 'legend', name: 'Legendary Summiteer', tier: 'LEGENDARY', cost: 15000, successRate: 0.28, skewMult: 1.25,
    blurb: 'The best money can hire.' }
];
const CLIMBER_TIER_COLOR = { STARTER: 'var(--dim)', VETERAN: '#059669', ELITE: '#6366f1', LEGENDARY: '#d97706' };

// tempStopBonus / windStopBonus widen how much cold/wind live conditions can tolerate before a mountain
// is throttled (see WIND_STOP_KMH / TEMP_STOP_C in index.html). breakthroughBonus adds directly to
// breakthrough chance. skewMultBonus adds directly to the climber's skew multiplier. Weather-specific
// items (oxygen, boots, suit) only affect index.html, which is the only page with a weather system.
const GEAR = [
  { id: 'oxygen', name: 'Oxygen Tank', icon: '🫁', cost: 800, tempStopBonus: 8,
    blurb: 'Buys tolerance against extreme cold — +8°C to the cold cutoff.' },
  { id: 'boots', name: 'Expedition Boots', icon: '🥾', cost: 800, windStopBonus: 10,
    blurb: 'Warmer, stiffer, better traction — +10 km/h to the wind cutoff.' },
  { id: 'suit', name: 'Down Suit', icon: '🧥', cost: 900, tempStopBonus: 6,
    blurb: 'Serious insulation for the death zone — +6°C to the cold cutoff.' },
  { id: 'radio', name: 'Storm Radio', icon: '📻', cost: 1200, breakthroughBonus: 0.03,
    blurb: 'Real-time conditions from base camp — +3% breakthrough chance.' },
  { id: 'satphone', name: 'Satellite Phone', icon: '📡', cost: 1000, breakthroughBonus: 0.02,
    blurb: 'Coordination with the rest of the team — +2% breakthrough chance.' },
  { id: 'axe', name: 'Ice Axe & Crampons', icon: '⛏️', cost: 600, skewMultBonus: 0.05,
    blurb: 'Faster, safer movement on technical ground — +5% climb scale, every mountain.' }
];

function defaultAccountData() {
  return {
    balance: 5000,
    avatarId: 'climber',
    ownedAvatars: ['climber'],
    ownedClimbers: ['novice'],
    activeClimberId: 'novice',
    ownedGear: [],
    equippedGear: [],
    stats: { staked: 0, wins: 0, losses: 0, pl: 0, bestPayout: 0 },
    history: []
  };
}

function loadAccountData() {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return defaultAccountData();
    // Merge over defaults so fields added later don't break accounts saved before they existed.
    return Object.assign(defaultAccountData(), JSON.parse(raw));
  } catch (e) {
    return defaultAccountData();
  }
}

const Account = {
  data: loadAccountData(),

  save() {
    try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(this.data)); } catch (e) {}
  },

  avatar() { return AVATARS.find(a => a.id === this.data.avatarId) || AVATARS[0]; },
  activeClimber() { return CLIMBERS.find(c => c.id === this.data.activeClimberId) || CLIMBERS[0]; },
  equippedGearItems() { return this.data.equippedGear.map(id => GEAR.find(g => g.id === id)).filter(Boolean); },

  breakthroughChance() {
    const climber = this.activeClimber();
    const gearBonus = this.equippedGearItems().reduce((s, g) => s + (g.breakthroughBonus || 0), 0);
    return Math.min(0.5, climber.successRate + gearBonus);
  },
  skewMultiplier() {
    const climber = this.activeClimber();
    const gearBonus = this.equippedGearItems().reduce((s, g) => s + (g.skewMultBonus || 0), 0);
    return climber.skewMult + gearBonus;
  },
  tempStopBonus() { return this.equippedGearItems().reduce((s, g) => s + (g.tempStopBonus || 0), 0); },
  windStopBonus() { return this.equippedGearItems().reduce((s, g) => s + (g.windStopBonus || 0), 0); },

  canAfford(cost) { return this.data.balance >= cost; },

  buyAvatar(id) {
    const item = AVATARS.find(a => a.id === id);
    if (!item || this.data.ownedAvatars.includes(id) || !this.canAfford(item.cost)) return false;
    this.data.balance -= item.cost;
    this.data.ownedAvatars.push(id);
    this.save();
    return true;
  },
  equipAvatar(id) {
    if (!this.data.ownedAvatars.includes(id)) return false;
    this.data.avatarId = id;
    this.save();
    return true;
  },

  buyClimber(id) {
    const item = CLIMBERS.find(c => c.id === id);
    if (!item || this.data.ownedClimbers.includes(id) || !this.canAfford(item.cost)) return false;
    this.data.balance -= item.cost;
    this.data.ownedClimbers.push(id);
    this.save();
    return true;
  },
  setActiveClimber(id) {
    if (!this.data.ownedClimbers.includes(id)) return false;
    this.data.activeClimberId = id;
    this.save();
    return true;
  },

  buyGear(id) {
    const item = GEAR.find(g => g.id === id);
    if (!item || this.data.ownedGear.includes(id) || !this.canAfford(item.cost)) return false;
    this.data.balance -= item.cost;
    this.data.ownedGear.push(id);
    this.save();
    return true;
  },
  toggleGear(id) {
    if (!this.data.ownedGear.includes(id)) return false;
    const i = this.data.equippedGear.indexOf(id);
    if (i >= 0) {
      this.data.equippedGear.splice(i, 1);
    } else {
      if (this.data.equippedGear.length >= GEAR_SLOTS) return false;
      this.data.equippedGear.push(id);
    }
    this.save();
    return true;
  },

  recordBet(stake, payout) {
    const s = this.data.stats;
    s.staked += stake;
    s.pl += (payout - stake);
    if (payout > 0) { s.wins++; if (payout > s.bestPayout) s.bestPayout = payout; }
    else s.losses++;
    this.save();
  },
  pushHistory(entry) {
    this.data.history.unshift(entry);
    if (this.data.history.length > 20) this.data.history.pop();
    this.save();
  }
};
