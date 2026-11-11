-- Cheek Pouch player progress, keyed by wallet address (lowercase 0x…).

CREATE TABLE IF NOT EXISTS nonces (
  nonce      TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  message    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- only a SHA-256 of each session token is stored
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  address     TEXT PRIMARY KEY,
  nick        TEXT,
  best_score  INTEGER NOT NULL DEFAULT 0,
  best_level  INTEGER NOT NULL DEFAULT 0,
  best_secs   INTEGER NOT NULL DEFAULT 0,
  runs        INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  squeeks     INTEGER NOT NULL DEFAULT 0,
  staked      INTEGER NOT NULL DEFAULT 0,
  top_level   INTEGER NOT NULL DEFAULT 0,
  holdings_at INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  last_run_at INTEGER
);

-- the server times every run itself, so a client can't claim a longer run than it played
CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,
  address     TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  score       INTEGER,
  level       INTEGER
);

CREATE INDEX IF NOT EXISTS players_best ON players (best_score DESC);
CREATE INDEX IF NOT EXISTS runs_by_address ON runs (address, started_at);
