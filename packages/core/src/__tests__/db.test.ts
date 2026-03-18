import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

describe("database", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  it("creates an in-memory database", () => {
    db = createTestDb();
    expect(db.open).toBe(true);
  });

  it("enables WAL mode (in-memory falls back to 'memory')", () => {
    db = createTestDb();
    const result = db.pragma("journal_mode") as { journal_mode: string }[];
    // In-memory databases don't support WAL, they report "memory"
    // The pragma call still succeeds without error, which is what matters
    expect(result[0]?.journal_mode).toBe("memory");
  });

  it("enables foreign keys", () => {
    db = createTestDb();
    const result = db.pragma("foreign_keys") as { foreign_keys: number }[];
    expect(result[0]?.foreign_keys).toBe(1);
  });
});

describe("migrations", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  it("creates all tables", () => {
    db = createTestDb();
    runMigrations(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("sessions");
    expect(tableNames).toContain("tags");
    expect(tableNames).toContain("session_tags");
    expect(tableNames).toContain("session_events");
    expect(tableNames).toContain("projects");
    expect(tableNames).toContain("config");
    expect(tableNames).toContain("schema_version");
  });

  it("creates FTS virtual table", () => {
    db = createTestDb();
    runMigrations(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions_fts'",
      )
      .all() as { name: string }[];
    expect(tables).toHaveLength(1);
  });

  it("creates indexes", () => {
    db = createTestDb();
    runMigrations(db);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
      )
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain("idx_sessions_last_seen");
    expect(indexNames).toContain("idx_sessions_repo");
    expect(indexNames).toContain("idx_sessions_branch");
    expect(indexNames).toContain("idx_sessions_status");
    expect(indexNames).toContain("idx_sessions_pinned");
    expect(indexNames).toContain("idx_sessions_project_path");
    expect(indexNames).toContain("idx_session_events_session");
  });

  it("creates FTS triggers", () => {
    db = createTestDb();
    runMigrations(db);

    const triggers = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name",
      )
      .all() as { name: string }[];
    const triggerNames = triggers.map((t) => t.name);

    expect(triggerNames).toContain("sessions_ai");
    expect(triggerNames).toContain("sessions_ad");
    expect(triggerNames).toContain("sessions_au");
  });

  it("is idempotent (can run twice without error)", () => {
    db = createTestDb();
    runMigrations(db);
    runMigrations(db);

    const versions = db
      .prepare("SELECT version FROM schema_version ORDER BY version")
      .all() as { version: number }[];
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe(1);
  });

  it("tracks migration version", () => {
    db = createTestDb();
    runMigrations(db);

    const versions = db
      .prepare("SELECT version FROM schema_version")
      .all() as { version: number }[];
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe(1);
  });
});
