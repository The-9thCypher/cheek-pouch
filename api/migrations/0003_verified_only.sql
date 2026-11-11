-- Each Daily Burrow run keeps the plan it started with, so a later Squeekchain reading can't change its replay.
ALTER TABLE runs ADD COLUMN work INTEGER;

-- Only replay-verified Daily Burrow runs count for the all-time board and Block Champion from now on.
UPDATE players SET
  best_score = COALESCE((SELECT MAX(d.score) FROM daily_best d WHERE d.address = players.address), 0),
  best_level = COALESCE((SELECT d.level FROM daily_best d WHERE d.address = players.address ORDER BY d.score DESC LIMIT 1), 0),
  best_secs  = COALESCE((SELECT d.ticks / 30 FROM daily_best d WHERE d.address = players.address ORDER BY d.score DESC LIMIT 1), 0);

DELETE FROM block_best WHERE NOT EXISTS (
  SELECT 1 FROM daily_best d WHERE d.address = block_best.address AND d.score = block_best.score
);
