-- SQLite schema: card redemption + machine license (Aliyun)
CREATE TABLE IF NOT EXISTS cards (
  card TEXT PRIMARY KEY NOT NULL,
  days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused',
  used_at TEXT,
  redeemed_by TEXT,
  plan TEXT NOT NULL DEFAULT 'flagship'
);

CREATE TABLE IF NOT EXISTS machines (
  machine_id TEXT PRIMARY KEY NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'free',
  bound_platform TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);

-- 桌面端匿名运营埋点（按 machine_id 聚合，不含账号/话术等敏感内容）
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id TEXT NOT NULL,
  name TEXT NOT NULL,
  props TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_day_name ON events(created_at, name);
CREATE INDEX IF NOT EXISTS idx_events_machine_day ON events(machine_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(name);

-- 用户问题反馈（纯文字 + 可选压缩截图路径）
CREATE TABLE IF NOT EXISTS feedbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT '',
  bound_platform TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  image_count INTEGER NOT NULL DEFAULT 0,
  client_created_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status_created ON feedbacks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_feedbacks_machine_created ON feedbacks(machine_id, created_at);
