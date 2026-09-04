-- SQLite schema: card redemption + machine license (Aliyun)
CREATE TABLE IF NOT EXISTS cards (
  card TEXT PRIMARY KEY NOT NULL,
  days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused',
  used_at TEXT,
  redeemed_by TEXT
);

CREATE TABLE IF NOT EXISTS machines (
  machine_id TEXT PRIMARY KEY NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
