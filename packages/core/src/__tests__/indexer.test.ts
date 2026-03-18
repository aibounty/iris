import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMigrations } from "../db/migrate.js";
import { Indexer } from "../indexer/indexer.js";
import { SessionRepo } from "../repo/session-repo.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: `sess-${Math.random().toString(36).slice(2)}`,
    fullPath: "/path/to/session.jsonl",
    fileMtime: 1700000000000,
    firstPrompt: "Test prompt",
    summary: "Test summary",
    messageCount: 10,
    created: "2025-03-15T10:00:00.000Z",
    modified: "2025-03-15T12:00:00.000Z",
    gitBranch: "main",
    projectPath: "/home/user/myproject",
    isSidechain: false,
    customTitle: "",
    ...overrides,
  };
}

function makeIndexFile(
  entries: Record<string, unknown>[],
  originalPath = "/test/project",
) {
  return JSON.stringify({ version: 1, entries, originalPath });
}

function setupMockClaudeData(
  tmpDir: string,
  projects: { name: string; entries: Record<string, unknown>[] }[],
) {
  const projectsDir = join(tmpDir, "projects");
  mkdirSync(projectsDir, { recursive: true });

  for (const proj of projects) {
    const projDir = join(projectsDir, proj.name);
    mkdirSync(projDir, { recursive: true });
    writeFileSync(
      join(projDir, "sessions-index.json"),
      makeIndexFile(proj.entries),
    );
  }
}

describe("Indexer", () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = mkdtempSync(join(tmpdir(), "iris-indexer-test-"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("indexes sessions from Claude Code data", () => {
    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-a",
        entries: [
          makeEntry({ sessionId: "s1", projectPath: "/proj/a" }),
          makeEntry({ sessionId: "s2", projectPath: "/proj/a" }),
        ],
      },
    ]);

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });
    const result = indexer.scan();

    expect(result.total).toBe(2);
    expect(result.newSessions).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("counts updates on re-scan", () => {
    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-a",
        entries: [makeEntry({ sessionId: "s1" })],
      },
    ]);

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });
    indexer.scan();

    const result = indexer.scan();
    expect(result.total).toBe(1);
    expect(result.newSessions).toBe(0);
    expect(result.updated).toBe(1);
  });

  it("handles partially invalid data", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir, { recursive: true });

    const projDir = join(projectsDir, "-proj-a");
    mkdirSync(projDir);
    writeFileSync(
      join(projDir, "sessions-index.json"),
      makeIndexFile([
        makeEntry({ sessionId: "valid-1" }),
        makeEntry({ sessionId: "valid-2" }),
      ]),
    );

    // Add another project with corrupt index
    const projDir2 = join(projectsDir, "-proj-b");
    mkdirSync(projDir2);
    writeFileSync(
      join(projDir2, "sessions-index.json"),
      "not valid json",
    );

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });
    const result = indexer.scan();

    // Only valid sessions from proj-a should be indexed
    expect(result.total).toBe(2);
    expect(result.newSessions).toBe(2);
  });

  it("polling starts and stops", () => {
    vi.useFakeTimers();

    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-a",
        entries: [makeEntry({ sessionId: "s1" })],
      },
    ]);

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });

    expect(indexer.isPolling()).toBe(false);
    indexer.startPolling(1000);
    expect(indexer.isPolling()).toBe(true);

    indexer.stopPolling();
    expect(indexer.isPolling()).toBe(false);

    vi.useRealTimers();
  });
});

describe("Indexer integration", () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = mkdtempSync(join(tmpdir(), "iris-indexer-integration-"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("full pipeline: mock data → index → query → mutate → re-index → verify", () => {
    // 1. Create mock Claude Code data with 2 projects, 5 sessions
    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-alpha",
        entries: [
          makeEntry({
            sessionId: "a1",
            projectPath: "/proj/alpha",
            firstPrompt: "Setup project alpha",
            summary: "Initial project setup",
            gitBranch: "main",
          }),
          makeEntry({
            sessionId: "a2",
            projectPath: "/proj/alpha",
            firstPrompt: "Fix auth in alpha",
            summary: "Authentication debugging",
            gitBranch: "feature/auth",
          }),
          makeEntry({
            sessionId: "a3",
            projectPath: "/proj/alpha",
            firstPrompt: "Add redis caching",
            summary: "Redis integration",
            gitBranch: "feature/redis",
          }),
        ],
      },
      {
        name: "-proj-beta",
        entries: [
          makeEntry({
            sessionId: "b1",
            projectPath: "/proj/beta",
            firstPrompt: "CI setup for beta",
            summary: "CI/CD pipeline configuration",
            gitBranch: "main",
          }),
          makeEntry({
            sessionId: "b2",
            projectPath: "/proj/beta",
            firstPrompt: "Database migration",
            summary: "Migrate from MySQL to Postgres",
            gitBranch: "feature/postgres",
          }),
        ],
      },
    ]);

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });
    const repo = new SessionRepo(db);

    // 2. Run first scan
    const result1 = indexer.scan();
    expect(result1.total).toBe(5);
    expect(result1.newSessions).toBe(5);

    // 3. Verify all sessions present
    const all = repo.list({ limit: 100 });
    expect(all.items).toHaveLength(5);

    // 4. Add a note to one session
    const authSession = repo.findByClaudeId("a2")!;
    repo.updateNote(authSession.id, "stopped at retry logic");
    repo.updatePin(authSession.id, true);
    repo.addTag(authSession.id, "important");

    // 5. Re-scan
    const result2 = indexer.scan();
    expect(result2.total).toBe(5);
    expect(result2.newSessions).toBe(0);
    expect(result2.updated).toBe(5);

    // 6. Verify user data preserved
    const after = repo.findByClaudeId("a2")!;
    expect(after.note).toBe("stopped at retry logic");
    expect(after.pinned).toBe(1);
    expect(after.tags).toEqual(["important"]);

    // 7. Test FTS search
    const searchResult = repo.list({ q: "redis" });
    expect(searchResult.items).toHaveLength(1);
    expect(searchResult.items[0]!.claude_session_id).toBe("a3");

    // 8. Test repo filter
    const alphaOnly = repo.list({ repo: "alpha" });
    expect(alphaOnly.items).toHaveLength(3);
  });
});
