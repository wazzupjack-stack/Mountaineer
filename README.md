# Mountaineer

A parimutuel prediction-market demo themed around mountain ascents. Three static, dependency-free HTML pages plus one shared script — no build step, no backend, no server required.

> **Demo build.** All balances are play tokens (TKN) with no monetary value.

## Pages

### `index.html` — Peak Prediction Markets

The main page. Six real mountains (Everest, K2, Aconcagua, Denali, Kilimanjaro, Mont Blanc), each running a parimutuel bracket market (`#markets`) skinned as a climb: a mountain "climbs" from a base-camp altitude toward its real summit height on a live multiplier, players back a bracket (Base Camp / Camp II / High Camp / Summit) before the round locks, the pool's share per bracket sets the implied odds, and the winning bracket splits the pot pro-rata minus a 5% rake.

**The climb itself is weather-biased.** Each mountain's live wind speed and temperature are fetched from [Open-Meteo](https://open-meteo.com) (free, no API key, elevation-corrected for that summit's real altitude) and shown on its card, explicitly labelled as the summit reading. Those two numbers feed a disclosed formula — calm (≤20 km/h) and mild (≥-25°C) conditions are treated as not limiting; conditions scale down toward summit-stopping by 60 km/h wind or -45°C, whichever binds hardest — that throttles the mountain's peak-generating distribution (`weatherThrottle()`). Each round is a mixture: most of the time it draws from that weather-throttled distribution, but a flat chance (your account's **breakthrough chance** — see Loadout below) it draws from the mountain's full, weather-independent baseline instead — a team pushing through anyway. So on a genuinely dangerous-weather day the odds lean heavily toward Base Camp/Camp II, High Camp gets rare, and the Summit gets very rare — but never zero. `bracketProb()` computes this mixture's exact probability so the displayed odds always match what `rollPeak()` actually samples from. It's one market, not two: the round, its odds, and its outcome all come from the same mechanism.

Each card also shows a per-waypoint temperature gradient (Base Camp → Camp II → High Camp → Summit) so it's clear what the climb actually looks like along the way, not just at the top. These aren't separate live readings — they're the one live summit temperature extrapolated down via the standard ~6.5°C/1000m atmospheric lapse rate, capped at 15°C since that linear model stops being meaningful several kilometres below the summit.

Also included: a lifetime portfolio summary, a leaderboard with your own account slotted in against simulated players, a simulated global activity feed, and a dark/light theme toggle (persisted via `localStorage`).

### `mountaineer.html` — single-ascent crash game

A focused, single-mountain version of the climbing mechanic — a classic crash game (stake, watch the multiplier climb, cash out before it peaks or lose the stake). Linked from each mountain card on `index.html` ("▲ PLAY LIVE ASCENT") via `mountaineer.html?mountain=<id>`, which loads that specific mountain's real name and elevation. Uses the same account as the other two pages — same wallet, and the crash multiplier is scaled by your loadout's climb-scale bonus. Also has its own dark/light toggle and a link back to `index.html`.

### `loadout.html` — Expedition Loadout

A shop/profile page for your persistent account: an avatar (cosmetic), one active climber, and up to 3 equipped gear items, all bought with TKN from the same wallet used everywhere else. Effects are disclosed on each item's card, not hidden:

- **Climbers** — exactly one active at a time. Their **success rate** is your personal breakthrough chance (see above), and their **climb scale** multiplies the base variance on both `index.html` and `mountaineer.html`. Tiers: Novice Guide (free, the default) → Veteran Sherpa → Elite Alpinist → Legendary Summiteer.
- **Gear** — stacks with your climber, up to 3 slots. Oxygen Tank / Down Suit widen cold tolerance, Expedition Boots widen wind tolerance (`index.html` only — it's the only page with live weather), Storm Radio / Satellite Phone add flat breakthrough chance, and Ice Axe & Crampons adds flat climb scale (applies everywhere, including `mountaineer.html`).
- **Avatar** — purely cosmetic. Shown next to your wallet balance in the header on every page, and as your entry on `index.html`'s leaderboard.

## Running it

No install, no server — just open `index.html` (or any of the three pages) in a browser:

```
open index.html
```

`index.html` makes live network requests to `api.open-meteo.com` (refetched every 5 minutes per mountain); everything else runs entirely client-side. All three pages load `account.js` first for shared, persistent account state.

## Notes on what's real, disclosed, and simulated

- **Real**: the wind speed and temperature per mountain, live from Open-Meteo at its real summit coordinates/elevation.
- **Disclosed, not raw**: how weather numbers become a distribution-scaling factor, how the summit reading becomes a per-waypoint temperature gradient, and how your climber/gear loadout modifies both of those — all formulas we define, not directly-measured facts. Exact thresholds are shown in the UI (hover any weather badge, waypoint gradient, or check `loadout.html`) rather than hidden, but they're modelling choices, not a certified meteorological product.
- **Persistent, not multiplayer**: your wallet balance, lifetime stats, and loadout are saved to this browser via `localStorage` (`account.js`, shared by all three pages) and carry forward across visits — but they're still local to your browser, not a real account on a real server.
- **Simulated**: the pool's other participants, the leaderboard's other entries, the activity feed, and each round's exact outcome (a random draw *shaped* by live weather and your loadout, not a raw external fact) — this is a static site with no backend, so there's no real multiplayer crowd, and no round resolves against literal reality the way "the temperature was X" would.
