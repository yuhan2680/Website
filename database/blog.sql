CREATE TABLE IF NOT EXISTS blog_migrations (version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','published','trash')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  rss_guid TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_status_date ON posts(status, published_at DESC, id DESC);
