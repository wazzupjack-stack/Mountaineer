# Mountaineer

A parimutuel prediction-market demo themed around mountain ascents. Two static, dependency-free HTML pages — no build step, no backend, no server required.

> **Demo build.** All balances are play tokens (TKN) with no monetary value.

## Pages

### `index.html` — Peak Prediction Markets

The main page. Six real mountains (Everest, K2, Aconcagua, Denali, Kilimanjaro, Mont Blanc), each running a parimutuel bracket market (`#markets`) skinned as a climb: a mountain "climbs" from a base-camp altitude toward its real summit height on a live multiplier, players back a bracket (Base Camp / Camp II / High Camp / Summit) before the round locks, the pool's share per bracket sets the implied odds, and the winning bracket splits the pot pro-rata minus a 5% rake.

**The climb itself is weather-biased.** Each mountain's live wind speed and temperature are fetched from [Open-Meteo](https://open-meteo.com) (free, no API key, elevation-corrected for that summit's real altitude) and shown on its card, explicitly labelled as the summit reading. Those two numbers feed a disclosed formula — calm (≤20 km/h) and mild (≥-25°C) conditions are treated as not limiting; conditions scale down toward summit-stopping by 60 km/h wind or -45°C, whichever binds hardest — that throttles the mountain's peak-generating distribution (`weatherThrottle()`). Each round is a mixture: most of the time (92%) it draws from that weather-throttled distribution, but a flat 8% of the time (`BREAKTHROUGH_CHANCE`) it draws from the mountain's full, weather-independent baseline instead — a team pushing through anyway. So on a genuinely dangerous-weather day the odds lean heavily toward Base Camp/Camp II (on Everest-tier variance: ~57%/35%), High Camp gets rare (~7%), and the Summit gets very rare (~0.2%) — but never zero. `bracketProb()` computes this mixture's exact probability so the displayed odds always match what `rollPeak()` actually samples from. It's one market, not two: the round, its odds, and its outcome all come from the same mechanism.

Each card also shows a per-waypoint temperature gradient (Base Camp → Camp II → High Camp → Summit) so it's clear what the climb actually looks like along the way, not just at the top. These aren't separate live readings — they're the one live summit temperature extrapolated down via the standard ~6.5°C/1000m atmospheric lapse rate, capped at 15°C since that linear model stops being meaningful several kilometres below the summit.

Also included: a portfolio/session summary, a simulated leaderboard, a simulated global activity feed, and a dark/light theme toggle (persisted via `localStorage`).

### `mountaineer.html` — single-ascent crash game

A focused, single-mountain version of the climbing mechanic — a classic crash game (stake, watch the multiplier climb, cash out before it peaks or lose the stake). Linked from each mountain card on `index.html` ("▲ PLAY LIVE ASCENT") via `mountaineer.html?mountain=<id>`, which loads that specific mountain's real name and elevation. Also has its own dark/light toggle and a link back to `index.html`.

## Running it

No install, no server — just open either file in a browser:

```
open index.html
```

`index.html` makes live network requests to `api.open-meteo.com` (refetched every 5 minutes per mountain); everything else on both pages runs entirely client-side.

## Notes on what's real vs. simulated

- **Real**: the wind speed and temperature per mountain, live from Open-Meteo at its real summit coordinates/elevation.
- **Disclosed, not raw**: how those numbers turn into a distribution-scaling factor (and how the single summit reading becomes a per-waypoint temperature gradient) are formulas we define, not directly-measured facts — the exact thresholds are shown in the UI (hover the weather verdict badge or the waypoint gradient on any card) rather than hidden, but they're modelling choices, not a certified meteorological product.
- **Simulated**: the wallet balance, the pool's other participants, the leaderboard, the activity feed, and each round's exact outcome (a random draw *shaped* by the live weather factor above, not a raw external fact) — this is a static page with no backend, so there's no real multiplayer crowd, and no round resolves against literal reality the way "the temperature was X" would.
