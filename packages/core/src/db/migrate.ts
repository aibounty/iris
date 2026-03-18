import type Database from "better-sqlite3";

type Migration = (db: Database.Database) => void;

const migrations: Migration[] = [migration001];

function migration001(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      claude_session_id TEXT    UNIQUE NOT NULL,
      first_prompt      TEXT,
      summary           TEXT,
      custom_title      TEXT,
      note              TEXT,
      message_count     INTEGER NOT NULL DEFAULT 0,
      is_sidechain      INTEGER NOT NULL DEFAULT 0,
      status            TEXT    NOT NULL DEFAULT 'active',
      pinned            INTEGER NOT NULL DEFAULT 0,
      project_path      TEXT,
      repo_name         TEXT,
      git_branch        TEXT,
      jsonl_path        TEXT,
      started_at        TEXT    NOT NULL,
      last_seen_at      TEXT    NOT NULL,
      archived_at       TEXT,
      source            TEXT    NOT NULL DEFAULT 'passive',
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT    UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_tags (
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(session_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS session_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      event_type   TEXT    NOT NULL,
      payload_json TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT    UNIQUE NOT NULL,
      repo_name    TEXT    NOT NULL,
      last_seen_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_sessions_last_seen
      ON sessions(last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_repo
      ON sessions(repo_name);
    CREATE INDEX IF NOT EXISTS idx_sessions_branch
      ON sessions(git_branch);
    CREATE INDEX IF NOT EXISTS idx_sessions_status
      ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_pinned
      ON sessions(pinned, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_project_path
      ON sessions(project_path);
    CREATE INDEX IF NOT EXISTS idx_session_events_session
      ON session_events(session_id, created_at DESC);

    -- Full-text search
    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      first_prompt,
      summary,
      custom_title,
      note,
      repo_name,
      git_branch,
      content=sessions,
      content_rowid=id
    );

    -- FTS sync triggers
    CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
      INSERT INTO sessions_fts(rowid, first_prompt, summary, custom_title, note, repo_name, git_branch)
      VALUES (new.id, new.first_prompt, new.summary, new.custom_title, new.note, new.repo_name, new.git_branch);
    END;

    CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
      INSERT INTO sessions_fts(sessions_fts, rowid, first_prompt, summary, custom_title, note, repo_name, git_branch)
      VALUES ('delete', old.id, old.first_prompt, old.summary, old.custom_title, old.note, old.repo_name, old.git_branch);
    END;

    CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
      INSERT INTO sessions_fts(sessions_fts, rowid, first_prompt, summary, custom_title, note, repo_name, git_branch)
      VALUES ('delete', old.id, old.first_prompt, old.summary, old.custom_title, old.note, old.repo_name, old.git_branch);
      INSERT INTO sessions_fts(rowid, first_prompt, summary, custom_title, note, repo_name, git_branch)
      VALUES (new.id, new.first_prompt, new.summary, new.custom_title, new.note, new.repo_name, new.git_branch);
    END;
  `);
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER NOT NULL,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = db
    .prepare("SELECT version FROM schema_version ORDER BY version")
    .all() as { version: number }[];
  const appliedSet = new Set(applied.map((r) => r.version));

  const insert = db.prepare(
    "INSERT INTO schema_version (version) VALUES (?)",
  );

  for (let i = 0; i < migrations.length; i++) {
    const version = i + 1;
    if (appliedSet.has(version)) continue;

    const migration = migrations[i]!;
    db.transaction(() => {
      migration(db);
      insert.run(version);
    })();
  }
}
