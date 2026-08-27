// Round-math config only, mirrored from public/index.html's MTN array.
// Visual-only fields (colors, weather, profile, climate copy) stay client-side —
// the server never needs them to run a fair, authoritative round.
// `base` is deliberately 0 on every peak (not each mountain's real base-camp
// elevation) so a full community climb covers the whole real height of the
// mountain rather than just the narrow real climbing range — a longer climb
// cycle, not a factually-accurate one.
// growth is 1/3 of each peak's original rate — the climb used to cover
// half the mountain in ~10s and hit the true summit in under 19s no matter
// how tall the peak was, which read as "way too fast" regardless of how
// the mult-to-altitude curve was shaped. This is a pure time dilation
// (same climbT curve, same relative pacing shape, everything just takes
// 3x longer in real seconds) so it doesn't reopen the summit-approach or
// slow-start curve fixes — see the climbEase comment in public/index.html.
const MOUNTAINS = [
  { id: 'kilimanjaro', elev: 5895, base: 0, ceiling: 58.95, p0: 0.02, alpha: 1, growth: 0.0327, rake: 1.0, lossback: 0, lbCond: 0 },
  { id: 'aconcagua', elev: 6961, base: 0, ceiling: 69.61, p0: 0.04, alpha: 1, growth: 0.0347, rake: 1.0, lossback: 5, lbCond: 1.5 },
  { id: 'montblanc', elev: 4808, base: 0, ceiling: 48.08, p0: 0.07, alpha: 1, growth: 0.0363, rake: 0, lossback: 10, lbCond: 999 },
  { id: 'denali', elev: 6190, base: 0, ceiling: 61.90, p0: 0.08, alpha: 1, growth: 0.0377, rake: 5.0, lossback: 0, lbCond: 0 },
  { id: 'everest', elev: 8849, base: 0, ceiling: 88.49, p0: 0.12, alpha: 1, growth: 0.0407, rake: 3.0, lossback: 0, lbCond: 0 },
  { id: 'k2', elev: 8611, base: 0, ceiling: 86.11, p0: 0.22, alpha: 1, growth: 0.0443, rake: 8.0, lossback: 15, lbCond: 1.01 },
];

const MOUNTAINS_BY_ID = Object.fromEntries(MOUNTAINS.map(m => [m.id, m]));

module.exports = { MOUNTAINS, MOUNTAINS_BY_ID };
