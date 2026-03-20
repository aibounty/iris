import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import Database from "better-sqlite3";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  utimesSync,
} from "node:fs";
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

/** Create a minimal JSONL session file. */
function makeJsonlContent(opts: {
  sessionId: string;
  cwd?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  firstPrompt?: string;
  userMessages?: number;
  startTime?: string;
  endTime?: string;
}): string {
  const lines: string[] = [];
  const cwd = opts.cwd ?? "/home/user/myproject";
  const branch = opts.gitBranch ?? "main";
  const isSidechain = opts.isSidechain ?? false;
  const start = opts.startTime ?? "2025-03-15T10:00:00.000Z";
  const end = opts.endTime ?? "2025-03-15T12:00:00.000Z";
  const userCount = opts.userMessages ?? 1;

  for (let i = 0; i < userCount; i++) {
    const prompt =
      i === 0 ? opts.firstPrompt ?? "Test prompt" : `Follow-up ${i}`;
    lines.push(
      JSON.stringify({
        type: "user",
        sessionId: opts.sessionId,
        cwd,
        gitBranch: branch,
        isSidechain,
        uuid: `user-${i}`,
        parentUuid: i === 0 ? null : `assistant-${i - 1}`,
        message: { role: "user", content: prompt },
        timestamp: i === 0 ? start : end,
      }),
    );

    lines.push(
      JSON.stringify({
        type: "assistant",
        sessionId: opts.sessionId,
        cwd,
        gitBranch: branch,
        uuid: `assistant-${i}`,
        parentUuid: `user-${i}`,
        message: {
          role: "assistant",
          content: [{ type: "text", text: `Response ${i}` }],
        },
        timestamp: end,
      }),
    );
  }

  return lines.join("\n") + "\n";
}

function makeIndexFile(
  entries: Record<string, unknown>[],
  originalPath = "/test/project",
) {
  return JSON.stringify({ version: 1, entries, originalPath });
}

function setupMockClaudeData(
  tmpDir: string,
  projects: {
    name: string;
    sessions: {
      sessionId: string;
      cwd?: string;
      gitBranch?: string;
      isSidechain?: boolean;
      firstPrompt?: string;
      userMessages?: number;
      summary?: string;
      customTitle?: string;
    }[];
  }[],
) {
  const projectsDir = join(tmpDir, "projects");
  mkdirSync(projectsDir, { recursive: true });

  for (const proj of projects) {
    const projDir = join(projectsDir, proj.name);
    mkdirSync(projDir, { recursive: true });

    // Create JSONL files for each session
    for (const sess of proj.sessions) {
      writeFileSync(
        join(projDir, `${sess.sessionId}.jsonl`),
        makeJsonlContent({
          sessionId: sess.sessionId,
          cwd: sess.cwd ?? "/home/user/myproject",
          gitBranch: sess.gitBranch ?? "main",
          isSidechain: sess.isSidechain,
          firstPrompt: sess.firstPrompt ?? "Test prompt",
          userMessages: sess.userMessages ?? 1,
        }),
      );
    }

    // Create sessions-index.json for enrichment (summary/customTitle)
    const indexEntries = proj.sessions
      .filter((s) => s.summary || s.customTitle)
      .map((s) => ({
        sessionId: s.sessionId,
        fullPath: join(projDir, `${s.sessionId}.jsonl`),
        fileMtime: Date.now(),
        firstPrompt: s.firstPrompt ?? "Test prompt",
        summary: s.summary ?? "",
        messageCount: (s.userMessages ?? 1) * 2,
        created: "2025-03-15T10:00:00.000Z",
        modified: "2025-03-15T12:00:00.000Z",
        gitBranch: s.gitBranch ?? "main",
        projectPath: s.cwd ?? "/home/user/myproject",
        isSidechain: s.isSidechain ?? false,
        customTitle: s.customTitle ?? "",
      }));

    if (indexEntries.length > 0) {
      writeFileSync(
        join(projDir, "sessions-index.json"),
        makeIndexFile(indexEntries),
      );
    }
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

  it("indexes sessions from JSONL files", () => {
    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-a",
        sessions: [
          { sessionId: "s1", cwd: "/proj/a" },
          { sessionId: "s2", cwd: "/proj/a" },
        ],
      },
    ]);

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });
    const result = indexer.scan();

    expect(result.total).toBe(2);
    expect(result.newSessions).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("enriches sessions with summary from sessions-index.json", () => {
    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-a",
        sessions: [
          {
            sessionId: "s1",
            cwd: "/proj/a",
            summary: "Debugged auth flow",
            customTitle: "Auth Fix",
          },
        ],
      },
    ]);

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });
    indexer.scan();

    const repo = new SessionRepo(db);
    const session = repo.findByClaudeId("s1");
    expect(session).not.toBeNull();
    expect(session!.summary).toBe("Debugged auth flow");
    expect(session!.custom_title).toBe("Auth Fix");
  });

  it("counts updates on re-scan", () => {
    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-a",
        sessions: [{ sessionId: "s1" }],
      },
    ]);

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });
    indexer.scan();

    // Force re-scan by resetting cache
    indexer.resetCache();
    const result = indexer.scan();
    expect(result.total).toBe(1);
    expect(result.newSessions).toBe(0);
    expect(result.updated).toBe(1);
  });

  it("skips unchanged files on incremental scan", () => {
    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-a",
        sessions: [{ sessionId: "s1" }, { sessionId: "s2" }],
      },
    ]);

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });

    // First scan indexes everything
    const result1 = indexer.scan();
    expect(result1.total).toBe(2);
    expect(result1.skipped).toBe(0);

    // Second scan skips unchanged files
    const result2 = indexer.scan();
    expect(result2.total).toBe(0);
    expect(result2.skipped).toBe(2);
    expect(result2.newSessions).toBe(0);
  });

  it("re-scans files whose mtime changed", () => {
    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-a",
        sessions: [{ sessionId: "s1" }],
      },
    ]);

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });
    indexer.scan();

    // Touch the file to change mtime
    const filePath = join(tmpDir, "projects", "-proj-a", "s1.jsonl");
    const futureTime = new Date(Date.now() + 10000);
    utimesSync(filePath, futureTime, futureTime);

    const result = indexer.scan();
    expect(result.total).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.updated).toBe(1);
  });

  it("handles partially invalid data", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir, { recursive: true });

    const projDir = join(projectsDir, "-proj-a");
    mkdirSync(projDir);
    writeFileSync(
      join(projDir, "valid-session.jsonl"),
      makeJsonlContent({ sessionId: "valid-1", cwd: "/proj/a" }),
    );

    // Create a corrupt JSONL file
    writeFileSync(join(projDir, "corrupt.jsonl"), "not valid json at all\n");

    const indexer = new Indexer(db, { claudeDataDir: tmpDir });
    const result = indexer.scan();

    // The valid session should be indexed; corrupt file parsed as null (skipped, no error)
    expect(result.newSessions).toBe(1);
    expect(result.errors).toBe(0);
  });

  it("polling starts and stops", () => {
    vi.useFakeTimers();

    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-a",
        sessions: [{ sessionId: "s1" }],
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

  it("full pipeline: JSONL files → index → query → mutate → re-index → verify", () => {
    // 1. Create mock Claude Code data with 2 projects, 5 sessions
    setupMockClaudeData(tmpDir, [
      {
        name: "-proj-alpha",
        sessions: [
          {
            sessionId: "a1",
            cwd: "/proj/alpha",
            firstPrompt: "Setup project alpha",
            summary: "Initial project setup",
            gitBranch: "main",
          },
          {
            sessionId: "a2",
            cwd: "/proj/alpha",
            firstPrompt: "Fix auth in alpha",
            summary: "Authentication debugging",
            gitBranch: "feature/auth",
          },
          {
            sessionId: "a3",
            cwd: "/proj/alpha",
            firstPrompt: "Add redis caching",
            summary: "Redis integration",
            gitBranch: "feature/redis",
          },
        ],
      },
      {
        name: "-proj-beta",
        sessions: [
          {
            sessionId: "b1",
            cwd: "/proj/beta",
            firstPrompt: "CI setup for beta",
            summary: "CI/CD pipeline configuration",
            gitBranch: "main",
          },
          {
            sessionId: "b2",
            cwd: "/proj/beta",
            firstPrompt: "Database migration",
            summary: "Migrate from MySQL to Postgres",
            gitBranch: "feature/postgres",
          },
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

    // 5. Re-scan (reset cache to force full scan)
    indexer.resetCache();
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
