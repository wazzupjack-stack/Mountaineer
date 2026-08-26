# Mountaineer

A crash-style betting game where every round is a shared, real-time climb up one of six real mountains. The multiplier is the altitude: cash out ("turn back") before the round ends and your stake is multiplied by wherever the climb stopped; if it falls first, the stake is gone. A community jackpot builds slowly across many rounds as each mountain's long-term progress creeps toward its true summit, with a rare full summit paying it out.

Every player watching a given mountain sees the exact same live state — the same multiplier, the same jackpot, the same bets landing in the feed — because the round is decided and run entirely on the server. Nothing about the outcome is computed or trusted client-side.

## Quick start

Requires Docker and Docker Compose.

```bash
cp .env.example .env        # set a real POSTGRES_PASSWORD
docker compose up -d --build
```

Open `http://localhost:8080`. Postgres data persists in the `pgdata` named volume across restarts; `docker compose down -v` deletes it.

After changing anything under `backend/` or `public/`, rebuild and redeploy with:

```bash
docker compose up -d --build app
```

## Architecture

- **`app` service** — a single Node.js process (`backend/src/server.js`, Express + the `ws` library) that serves the static client, the auth REST endpoints, and the WebSocket game connection all on one port. No nginx, no separate API server.
- **`db` service** — Postgres 16. Migrations (`backend/migrations/*.sql`) are applied automatically on every boot by a small hand-rolled runner (`backend/src/db.js`) that tracks what's already been applied in a `schema_migrations` table — there's no separate migrate step to remember.
- **One `Room` per mountain** (`backend/src/game/room.js`), all six running continuously from boot regardless of whether anyone is watching. Each room ticks its round every 100ms and broadcasts a `sync` to subscribers every 180ms. The client (`public/index.html`) predicts the multiplier forward between syncs for smooth 60fps rendering, but a round only ever actually ends when the server sends `roundEnd` — the client has no authority over outcomes, timing, or payouts.
- **Provably fair**: each round's outcome is drawn from `crypto.randomBytes` server-side (`backend/src/game/rng.js`) and committed to via a `sha256(serverSeed)` hash broadcast *before* betting closes. The seed itself is only revealed once the round ends, at which point anyone can replay `crashFromSeed(serverSeed, clientSeed, nonce)` — the identical pure function ported to the client — and confirm it matches the crash point that was shown.
- **Accounts**: real signup/login (bcrypt + a server-side session cookie, `backend/src/auth/`), not anonymous. Anyone can watch any mountain's live state logged out; only placing a bet requires auth. Balance is only ever mutated through two guarded SQL updates (`backend/src/game/wallet.js`) — debit is conditional on sufficient balance in the same statement, so two concurrent bets from the same account (two tabs) can't both succeed.

## Project layout

```
public/index.html          the entire client — single-file canvas game, no build step
backend/
  src/
    server.js              entrypoint: runs migrations, wires up Express + the WS upgrade
    db.js                  pg Pool + the migration runner
    config/mountains.js    the six mountains' round-math config (elevation, ceiling, growth, house edge)
    auth/                  signup/login/session (cookie-based)
    game/
      rng.js               commit-reveal seed generation + the crash-point draw
      round.js             pure round math: altitude curve, summit-push condition
      room.js              one Room per mountain: round loop, bets, payouts, ambient bots
      rooms.js             boots the six Rooms, reads the env toggles below
      wallet.js            the only code path allowed to touch account balance
    ws/                    WebSocket message types + the inbound message router
  migrations/001_init.sql  users, sessions, mountain_state, rounds, bets
```

## The six peaks

Each mountain's ceiling (max multiplier) is its real elevation ÷ 100, and its instant-fail chance and house edge roughly track its real fatality rate — a taller, more dangerous mountain climbs higher but falls harder.

| Mountain    | Elevation | Ceiling | Instant fail | Base RTP |
|-------------|-----------|---------|---------------|----------|
| Kilimanjaro | 5,895 m   | 58.95×  | 2%            | 98.0%    |
| Aconcagua   | 6,961 m   | 69.61×  | 4%            | 96.0%    |
| Mont Blanc  | 4,808 m   | 48.08×  | 7%            | 93.0%    |
| Denali      | 6,190 m   | 61.90×  | 8%            | 92.0%    |
| Everest     | 8,849 m   | 88.49×  | 12%           | 88.0%    |
| K2          | 8,611 m   | 86.11×  | 22%           | 78.0%    |

The multiplier-to-altitude curve is intentionally not linear: it eases in gently from a fresh climb (so the bottom of a round doesn't feel like it rockets past) and compresses again near the top (so a round doesn't feel stuck just short of the summit). A separate, much slower-moving "community progress" tracks each mountain's cumulative altitude across every round ever played on it; once that gets within the last 5% of the true summit, rounds enter a "summit push" with better odds of finishing the climb and paying out that mountain's jackpot.

## Configuration

Set in `.env` (see `.env.example`) and passed through by `docker-compose.yml`:

| Variable | Purpose |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres credentials, shared into `DATABASE_URL` for the app |
| `SESSION_COOKIE_SECURE` | Set `"true"` behind HTTPS in production; the cookie won't be sent over plain HTTP otherwise |
| `AMBIENT_BOTS_ENABLED` | Fake bot bets/cashouts mixed into the live feed so it doesn't look empty at low real traffic. On by default — flip to `"false"` once there's real traffic and this is no longer needed |
| `DEMO_JACKPOT_BOOST_ENABLED` | **Demo/testing only.** Inflates the *displayed* jackpot number with fake activity to make demos look livelier. Never touches the real jackpot, never persisted to the database (`Room.displayJackpot()` in `room.js` is the only thing that reads it) — safe to delete or set to `"false"` at any time with nothing to clean up. Check this is what you want before a real deployment |

## Notes for local development

- The server sends `Cache-Control: no-cache` on every response, so a rebuilt client is never masked by a stale browser cache — no hard-refresh needed after `docker compose up -d --build app`.
- To inspect or hand-edit database state safely, stop the app first (`docker compose stop app`), make the change, then start it again — editing rows while the app is running races the in-memory `Room` state, which will overwrite your change moments later.
- The client is one HTML file with no build step; the server is plain CommonJS with no bundler. Editing either only requires a container rebuild, not a asset pipeline.
