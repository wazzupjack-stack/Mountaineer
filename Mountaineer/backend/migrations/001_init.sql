-- Initial schema: accounts, sessions, shared mountain state, round/bet audit trail.

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  balance       NUMERIC(18,2) NOT NULL DEFAULT 1000.00 CHECK (balance >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE mountain_state (
  mountain_id TEXT PRIMARY KEY,
  progress_m  NUMERIC(10,2) NOT NULL DEFAULT 0,
  jackpot     NUMERIC(14,2) NOT NULL DEFAULT 0,
  nonce       BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO mountain_state (mountain_id) VALUES
  ('kilimanjaro'),('aconcagua'),('montblanc'),('denali'),('everest'),('k2');

CREATE TABLE rounds (
  id               BIGSERIAL PRIMARY KEY,
  mountain_id      TEXT NOT NULL REFERENCES mountain_state(mountain_id),
  nonce            BIGINT NOT NULL,
  server_seed      TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  client_seed      TEXT NOT NULL,
  crash_at         NUMERIC(10,2) NOT NULL,
  summit           BOOLEAN NOT NULL DEFAULT false,
  progress_after   NUMERIC(10,2) NOT NULL,
  jackpot_before   NUMERIC(14,2) NOT NULL,
  jackpot_paid     NUMERIC(14,2) NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mountain_id, nonce)
);

CREATE TABLE bets (
  id           BIGSERIAL PRIMARY KEY,
  round_id     BIGINT NOT NULL REFERENCES rounds(id),
  user_id      BIGINT NOT NULL REFERENCES users(id),
  stake        NUMERIC(14,2) NOT NULL CHECK (stake > 0),
  auto_cashout NUMERIC(10,2),
  cash_mult    NUMERIC(10,2),
  payout       NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund       NUMERIC(14,2) NOT NULL DEFAULT 0,
  result       TEXT NOT NULL CHECK (result IN ('pending','cashed','lost')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at   TIMESTAMPTZ
);
CREATE INDEX idx_bets_user ON bets(user_id, created_at DESC);
CREATE INDEX idx_bets_round ON bets(round_id);
