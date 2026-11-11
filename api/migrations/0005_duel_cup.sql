-- Weekly Duel Cup: most duel wins Monday to Sunday (UTC). Settled once, the first time it's asked for.
CREATE TABLE IF NOT EXISTS duel_cups (
  week    TEXT PRIMARY KEY,   -- Monday of the week
  address TEXT,               -- NULL when nobody won a duel that week
  wins    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS duels_resolved ON duels (resolved_at);
ALTER TABLE players ADD COLUMN cups INTEGER NOT NULL DEFAULT 0;
