-- Public duels are listed in the Open challenges lobby; link-only ones are not.
ALTER TABLE duels ADD COLUMN public INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS duels_open ON duels (public, b, resolved_at, expires_at);
