-- Daily Burrow, Block Champion, missions, streaks and XP.

ALTER TABLE players ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN best_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN last_play_day TEXT;
ALTER TABLE players ADD COLUMN equip TEXT;

ALTER TABLE runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE runs ADD COLUMN day TEXT;

-- the day's seed inputs, fixed once computed so everyone plays the same run
CREATE TABLE IF NOT EXISTS daily_info (
  day  TEXT PRIMARY KEY,
  work INTEGER NOT NULL
);

-- each player's best verified Daily Burrow run, with its key presses for the ghost
CREATE TABLE IF NOT EXISTS daily_best (
  day     TEXT NOT NULL,
  address TEXT NOT NULL,
  score   INTEGER NOT NULL,
  level   INTEGER NOT NULL,
  ticks   INTEGER NOT NULL,
  inputs  TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (day, address)
);
CREATE INDEX IF NOT EXISTS daily_rank ON daily_best (day, score DESC);

-- best score set while each Squeekchain block was being mined
CREATE TABLE IF NOT EXISTS block_best (
  block   INTEGER PRIMARY KEY,
  address TEXT NOT NULL,
  score   INTEGER NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS block_by_address ON block_best (address);

CREATE TABLE IF NOT EXISTS mission_progress (
  address  TEXT NOT NULL,
  period   TEXT NOT NULL,
  mission  TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  done     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (address, period, mission)
);
