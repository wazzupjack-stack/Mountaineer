const crypto = require('crypto');

// Ported verbatim from the client — this is the pure crash-point formula,
// not the security boundary (that's the sha256 commitment below). Keeping
// it identical means a client can independently replay a revealed round
// and get the exact same crashAt.
function xmur3(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function rnd(n, d = 2) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function crashFromSeed(m, seed, cSeed, n) {
  const f = xmur3(seed + ':' + cSeed + ':' + n);
  f();
  const r = f() / 4294967296;
  if (r < m.p0) return 1.00;
  const u = (r - m.p0) / (1 - m.p0);
  const c = Math.pow(1 - u, -1 / m.alpha);
  if (c >= m.ceiling) return rnd(m.ceiling);
  return Math.max(1.00, rnd(c));
}

// Real CSPRNG server seed + real sha256 commitment — this is the actual
// fairness boundary. The client never sees `serverSeed` until reveal.
function newServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

module.exports = { xmur3, rnd, crashFromSeed, newServerSeed, sha256 };
