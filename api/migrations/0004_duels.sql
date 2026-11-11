-- Duels: two players, one secret seed, one verified attempt each. Higher score wins.
CREATE TABLE IF NOT EXISTS duels (
  id          TEXT PRIMARY KEY,
  seed        INTEGER NOT NULL,
  day         TEXT NOT NULL,      -- golden-seed plan is the creation day's
  work        INTEGER NOT NULL,
  a           TEXT NOT NULL,      -- challenger
  b           TEXT,               -- whoever accepts the link first
  a_run TEXT, a_score INTEGER, a_level INTEGER, a_ticks INTEGER, a_inputs TEXT,
  b_run TEXT, b_score INTEGER, b_level INTEGER, b_ticks INTEGER, b_inputs TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  resolved_at INTEGER,
  winner      TEXT,               -- address, 'tie', or NULL when nobody accepted
  prize_a     INTEGER NOT NULL DEFAULT 0,
  prize_b     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS duels_a ON duels (a, created_at DESC);
CREATE INDEX IF NOT EXISTS duels_b ON duels (b, created_at DESC);

ALTER TABLE runs ADD COLUMN duel TEXT;
ALTER TABLE players ADD COLUMN duel_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN duel_losses INTEGER NOT NULL DEFAULT 0;
