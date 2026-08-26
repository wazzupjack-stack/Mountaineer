// Pure round math, ported verbatim from the client's altOf()/beginClimb()
// growth formula so the server produces exactly the same curve the client
// used to compute locally. `progress` is metres of cumulative community
// climb (0..elev-base), the same anchor the client's altOf() used.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Fraction of the way from wherever this round started to the true summit
// that a given multiplier climbs — the exponent is what makes each round
// contribute proportionally more near the bottom of ITS OWN climb than a
// straight-line mapping would, and less right at the very top of it.
function climbT(cfg, mult) {
  const lt = clamp(Math.log(Math.max(mult, 1)) / Math.log(cfg.ceiling), 0, 1);
  return Math.pow(lt, 0.6);
}

function altOf(cfg, progress, mult) {
  const startAlt = cfg.base + (progress || 0);
  return startAlt + (cfg.elev - startAlt) * climbT(cfg, mult);
}

function stepMult(cfg, mult, dt) {
  const frac = clamp(Math.log(mult) / Math.log(cfg.ceiling), 0, 1);
  return mult * Math.exp(cfg.growth * (1 + 4.2 * Math.pow(frac, 1.35)) * dt);
}

// Matches the client's SUMMIT_PUSH_FRAC — the "🚩 SUMMIT PUSH" banner and
// this easier finishing condition kick in at the exact same point.
const SUMMIT_PUSH_FRAC = 0.95;
// Once genuinely in the push, a round no longer has to close almost the
// ENTIRE remaining sliver of the mountain (that's what "top 0.1% of the
// WHOLE mountain" demands from 95% progress — practically ceiling-level
// multipliers, every time). Closing this much of what's actually left is
// still a big, uncommon multiplier, but a real, small, felt chance each
// climb — not a near-impossible one. Below the push zone this changes
// nothing: reaching the top from far away still needs the full 0.999
// threshold, so a stray modest crash still can't finish it from a
// distance (that guarantee predates this and stays intact).
const PUSH_T_REQUIRED = 0.75;

// Top 0.1% of the altitude range — see public/index.html's old endRound()
// comment (now backend/src/game/room.js) for the tuning history behind
// this exact threshold for the far-from-the-top case.
function isSummit(cfg, progress, crashAt) {
  const range = cfg.elev - cfg.base;
  const closeEnoughAlt = cfg.base + range * 0.999;
  if (altOf(cfg, progress, crashAt) >= closeEnoughAlt) return true;
  const progressFrac = clamp((progress || 0) / range, 0, 1);
  if (progressFrac < SUMMIT_PUSH_FRAC) return false;
  return climbT(cfg, crashAt) >= PUSH_T_REQUIRED;
}

module.exports = { altOf, stepMult, isSummit, clamp, climbT };
