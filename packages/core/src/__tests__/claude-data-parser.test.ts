import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseSessionIndexFile,
  discoverProjectDirs,
  parseAllSessions,
  toSessionUpsert,
  buildSummaryMap,
  jsonlEntryToSessionUpsert,
} from "../parser/claude-data-parser.js";
import {
  discoverJsonlFiles,
  parseJsonlFile,
} from "../parser/jsonl-parser.js";

function makeIndexFile(
  entries: Record<string, unknown>[],
  originalPath = "/test/project",
) {
  return JSON.stringify({
    version: 1,
    entries,
    originalPath,
  });
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "abc-123",
    fullPath: "/home/.claude/projects/-test/abc-123.jsonl",
    fileMtime: 1700000000000,
    firstPrompt: "Fix the auth bug",
    summary: "Debugged auth token refresh",
    messageCount: 42,
    created: "2025-03-15T10:00:00.000Z",
    modified: "2025-03-15T12:00:00.000Z",
    gitBranch: "feature/auth",
    projectPath: "/home/user/myproject",
    isSidechain: false,
    customTitle: "Auth debugging",
    ...overrides,
  };
}

/** Create a minimal JSONL session file with user and assistant messages. */
function makeJsonlContent(opts: {
  sessionId: string;
  cwd?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  firstPrompt?: string;
  userMessages?: number;
  assistantMessages?: number;
  startTime?: string;
  endTime?: string;
}): string {
  const lines: string[] = [];
  const cwd = opts.cwd ?? "/test/project";
  const branch = opts.gitBranch ?? "main";
  const isSidechain = opts.isSidechain ?? false;
  const start = opts.startTime ?? "2025-03-15T10:00:00.000Z";
  const end = opts.endTime ?? "2025-03-15T12:00:00.000Z";
  const userCount = opts.userMessages ?? 1;
  const assistantCount = opts.assistantMessages ?? 1;

  // File history snapshot (first line)
  lines.push(
    JSON.stringify({
      type: "file-history-snapshot",
      messageId: "snap-1",
      snapshot: {
        messageId: "snap-1",
        trackedFileBackups: {},
        timestamp: start,
      },
    }),
  );

  // User messages
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

    // Corresponding assistant message
    if (i < assistantCount) {
      lines.push(
        JSON.stringify({
          type: "assistant",
          sessionId: opts.sessionId,
          cwd,
          gitBranch: branch,
          isSidechain,
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
  }

  return lines.join("\n") + "\n";
}

describe("parseSessionIndexFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "iris-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses valid session index file", () => {
    const filePath = join(tmpDir, "sessions-index.json");
    writeFileSync(filePath, makeIndexFile([makeEntry()]));

    const entries = parseSessionIndexFile(filePath);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.sessionId).toBe("abc-123");
    expect(entries[0]!.firstPrompt).toBe("Fix the auth bug");
    expect(entries[0]!.messageCount).toBe(42);
    expect(entries[0]!.gitBranch).toBe("feature/auth");
  });

  it("returns empty for missing file", () => {
    const entries = parseSessionIndexFile("/nonexistent/file.json");
    expect(entries).toEqual([]);
  });

  it("returns empty for invalid JSON", () => {
    const filePath = join(tmpDir, "sessions-index.json");
    writeFileSync(filePath, "not json {{{");

    const entries = parseSessionIndexFile(filePath);
    expect(entries).toEqual([]);
  });

  it("strips extra unknown fields (forward-compatible)", () => {
    const filePath = join(tmpDir, "sessions-index.json");
    writeFileSync(
      filePath,
      makeIndexFile([
        makeEntry({ futureField: "some-value", anotherNew: 42 }),
      ]),
    );

    const entries = parseSessionIndexFile(filePath);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.sessionId).toBe("abc-123");
  });

  it("applies defaults for missing optional fields", () => {
    const filePath = join(tmpDir, "sessions-index.json");
    writeFileSync(
      filePath,
      makeIndexFile([
        {
          sessionId: "minimal-session",
        },
      ]),
    );

    const entries = parseSessionIndexFile(filePath);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.sessionId).toBe("minimal-session");
    expect(entries[0]!.firstPrompt).toBe("");
    expect(entries[0]!.summary).toBe("");
    expect(entries[0]!.messageCount).toBe(0);
    expect(entries[0]!.gitBranch).toBe("");
    expect(entries[0]!.isSidechain).toBe(false);
  });

  it("handles multiple entries", () => {
    const filePath = join(tmpDir, "sessions-index.json");
    writeFileSync(
      filePath,
      makeIndexFile([
        makeEntry({ sessionId: "s1" }),
        makeEntry({ sessionId: "s2" }),
        makeEntry({ sessionId: "s3" }),
      ]),
    );

    const entries = parseSessionIndexFile(filePath);
    expect(entries).toHaveLength(3);
  });
});

describe("discoverProjectDirs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "iris-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds project directories with sessions-index.json", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);

    const proj1 = join(projectsDir, "-home-user-projectA");
    mkdirSync(proj1);
    writeFileSync(join(proj1, "sessions-index.json"), makeIndexFile([]));

    const proj2 = join(projectsDir, "-home-user-projectB");
    mkdirSync(proj2);
    writeFileSync(join(proj2, "sessions-index.json"), makeIndexFile([]));

    const dirs = discoverProjectDirs(tmpDir);
    expect(dirs).toHaveLength(2);
  });

  it("skips directories without sessions-index.json", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);

    const withIndex = join(projectsDir, "-with-index");
    mkdirSync(withIndex);
    writeFileSync(join(withIndex, "sessions-index.json"), makeIndexFile([]));

    const withoutIndex = join(projectsDir, "-without-index");
    mkdirSync(withoutIndex);
    writeFileSync(join(withoutIndex, "other-file.txt"), "hello");

    const dirs = discoverProjectDirs(tmpDir);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain("-with-index");
  });

  it("returns empty for non-existent directory", () => {
    const dirs = discoverProjectDirs("/nonexistent/dir");
    expect(dirs).toEqual([]);
  });

  it("returns empty when projects dir is missing", () => {
    const dirs = discoverProjectDirs(tmpDir); // exists but no projects/ subdir
    expect(dirs).toEqual([]);
  });
});

describe("discoverJsonlFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "iris-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("discovers JSONL files in project directories", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);

    const proj = join(projectsDir, "-test-project");
    mkdirSync(proj);
    writeFileSync(
      join(proj, "aaaa-bbbb-cccc-dddd.jsonl"),
      makeJsonlContent({ sessionId: "aaaa-bbbb-cccc-dddd" }),
    );
    writeFileSync(
      join(proj, "eeee-ffff-0000-1111.jsonl"),
      makeJsonlContent({ sessionId: "eeee-ffff-0000-1111" }),
    );

    const files = discoverJsonlFiles(tmpDir);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.path.endsWith(".jsonl"))).toBe(true);
    expect(files.every((f) => f.mtimeMs > 0)).toBe(true);
  });

  it("excludes agent-prefixed JSONL files", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);

    const proj = join(projectsDir, "-test-project");
    mkdirSync(proj);
    writeFileSync(
      join(proj, "session-1.jsonl"),
      makeJsonlContent({ sessionId: "session-1" }),
    );
    writeFileSync(
      join(proj, "agent-task-abc.jsonl"),
      makeJsonlContent({ sessionId: "agent-task-abc" }),
    );

    const files = discoverJsonlFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toContain("session-1.jsonl");
  });

  it("discovers files across multiple project directories", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);

    const proj1 = join(projectsDir, "-proj-a");
    mkdirSync(proj1);
    writeFileSync(
      join(proj1, "s1.jsonl"),
      makeJsonlContent({ sessionId: "s1" }),
    );

    const proj2 = join(projectsDir, "-proj-b");
    mkdirSync(proj2);
    writeFileSync(
      join(proj2, "s2.jsonl"),
      makeJsonlContent({ sessionId: "s2" }),
    );
    writeFileSync(
      join(proj2, "s3.jsonl"),
      makeJsonlContent({ sessionId: "s3" }),
    );

    const files = discoverJsonlFiles(tmpDir);
    expect(files).toHaveLength(3);
  });

  it("returns empty for non-existent directory", () => {
    const files = discoverJsonlFiles("/nonexistent/dir");
    expect(files).toEqual([]);
  });
});

describe("parseJsonlFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "iris-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("extracts session metadata from JSONL file", () => {
    const filePath = join(tmpDir, "test-session.jsonl");
    writeFileSync(
      filePath,
      makeJsonlContent({
        sessionId: "sess-123",
        cwd: "/home/user/project",
        gitBranch: "feature/test",
        firstPrompt: "Fix the auth bug",
        startTime: "2025-03-15T10:00:00.000Z",
        endTime: "2025-03-15T12:00:00.000Z",
      }),
    );

    const entry = parseJsonlFile(filePath);
    expect(entry).not.toBeNull();
    expect(entry!.sessionId).toBe("sess-123");
    expect(entry!.cwd).toBe("/home/user/project");
    expect(entry!.gitBranch).toBe("feature/test");
    expect(entry!.firstPrompt).toBe("Fix the auth bug");
    expect(entry!.startedAt).toBe("2025-03-15T10:00:00.000Z");
    expect(entry!.lastSeenAt).toBe("2025-03-15T12:00:00.000Z");
    expect(entry!.messageCount).toBe(2); // 1 user + 1 assistant
    expect(entry!.isSidechain).toBe(false);
  });

  it("handles sidechain sessions", () => {
    const filePath = join(tmpDir, "sidechain.jsonl");
    writeFileSync(
      filePath,
      makeJsonlContent({
        sessionId: "side-1",
        isSidechain: true,
      }),
    );

    const entry = parseJsonlFile(filePath);
    expect(entry).not.toBeNull();
    expect(entry!.isSidechain).toBe(true);
  });

  it("returns null for empty files", () => {
    const filePath = join(tmpDir, "empty.jsonl");
    writeFileSync(filePath, "");

    const entry = parseJsonlFile(filePath);
    expect(entry).toBeNull();
  });

  it("returns null for non-existent files", () => {
    const entry = parseJsonlFile(join(tmpDir, "nonexistent.jsonl"));
    expect(entry).toBeNull();
  });

  it("handles malformed lines gracefully", () => {
    const filePath = join(tmpDir, "malformed.jsonl");
    const content = [
      "not valid json {{{",
      JSON.stringify({
        type: "user",
        sessionId: "sess-ok",
        cwd: "/test",
        gitBranch: "main",
        isSidechain: false,
        uuid: "u1",
        parentUuid: null,
        message: { role: "user", content: "Hello" },
        timestamp: "2025-03-15T10:00:00.000Z",
      }),
      "another bad line",
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-ok",
        cwd: "/test",
        uuid: "a1",
        parentUuid: "u1",
        message: { role: "assistant", content: [{ type: "text", text: "Hi" }] },
        timestamp: "2025-03-15T10:05:00.000Z",
      }),
    ].join("\n");

    writeFileSync(filePath, content);

    const entry = parseJsonlFile(filePath);
    expect(entry).not.toBeNull();
    expect(entry!.sessionId).toBe("sess-ok");
    expect(entry!.firstPrompt).toBe("Hello");
    expect(entry!.messageCount).toBe(2);
  });

  it("derives sessionId from UUID filename when not in content", () => {
    const filePath = join(
      tmpDir,
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl",
    );
    // File with only file-history-snapshot lines (no sessionId in content)
    writeFileSync(
      filePath,
      JSON.stringify({
        type: "file-history-snapshot",
        messageId: "snap-1",
        snapshot: { timestamp: "2025-03-15T10:00:00.000Z" },
      }) + "\n",
    );

    const entry = parseJsonlFile(filePath);
    expect(entry).not.toBeNull();
    expect(entry!.sessionId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("counts multiple user and assistant messages", () => {
    const filePath = join(tmpDir, "multi.jsonl");
    writeFileSync(
      filePath,
      makeJsonlContent({
        sessionId: "multi-sess",
        userMessages: 3,
        assistantMessages: 3,
      }),
    );

    const entry = parseJsonlFile(filePath);
    expect(entry).not.toBeNull();
    expect(entry!.messageCount).toBe(6); // 3 user + 3 assistant
  });
});

describe("parseAllSessions (JSONL-based)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "iris-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("aggregates sessions from JSONL files across projects", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);

    const proj1 = join(projectsDir, "-proj-a");
    mkdirSync(proj1);
    writeFileSync(
      join(proj1, "s1.jsonl"),
      makeJsonlContent({ sessionId: "s1", cwd: "/proj/a" }),
    );
    writeFileSync(
      join(proj1, "s2.jsonl"),
      makeJsonlContent({ sessionId: "s2", cwd: "/proj/a" }),
    );

    const proj2 = join(projectsDir, "-proj-b");
    mkdirSync(proj2);
    writeFileSync(
      join(proj2, "s3.jsonl"),
      makeJsonlContent({ sessionId: "s3", cwd: "/proj/b" }),
    );

    const entries = parseAllSessions(tmpDir);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.sessionId).sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("excludes agent JSONL files", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);

    const proj = join(projectsDir, "-proj-a");
    mkdirSync(proj);
    writeFileSync(
      join(proj, "s1.jsonl"),
      makeJsonlContent({ sessionId: "s1" }),
    );
    writeFileSync(
      join(proj, "agent-sub-task.jsonl"),
      makeJsonlContent({ sessionId: "agent-sub-task" }),
    );

    const entries = parseAllSessions(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.sessionId).toBe("s1");
  });

  it("returns empty for non-existent directory", () => {
    const entries = parseAllSessions("/nonexistent/dir");
    expect(entries).toEqual([]);
  });
});

describe("buildSummaryMap", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "iris-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("builds enrichment map from sessions-index.json files", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);

    const proj = join(projectsDir, "-proj-a");
    mkdirSync(proj);
    writeFileSync(
      join(proj, "sessions-index.json"),
      makeIndexFile([
        makeEntry({
          sessionId: "s1",
          summary: "Fixed auth",
          customTitle: "Auth fix",
        }),
        makeEntry({
          sessionId: "s2",
          summary: "Added caching",
          customTitle: "",
        }),
      ]),
    );

    const map = buildSummaryMap(tmpDir);
    expect(map.size).toBe(2);
    expect(map.get("s1")).toEqual({
      summary: "Fixed auth",
      customTitle: "Auth fix",
    });
    expect(map.get("s2")).toEqual({ summary: "Added caching", customTitle: "" });
  });

  it("returns empty map when no index files exist", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);
    mkdirSync(join(projectsDir, "-proj-a"));

    const map = buildSummaryMap(tmpDir);
    expect(map.size).toBe(0);
  });

  it("skips entries with no summary and no customTitle", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);

    const proj = join(projectsDir, "-proj-a");
    mkdirSync(proj);
    writeFileSync(
      join(proj, "sessions-index.json"),
      makeIndexFile([
        makeEntry({ sessionId: "s1", summary: "", customTitle: "" }),
        makeEntry({ sessionId: "s2", summary: "Has summary", customTitle: "" }),
      ]),
    );

    const map = buildSummaryMap(tmpDir);
    expect(map.size).toBe(1);
    expect(map.has("s1")).toBe(false);
    expect(map.has("s2")).toBe(true);
  });
});

describe("jsonlEntryToSessionUpsert", () => {
  it("maps JSONL entry fields correctly", () => {
    const upsert = jsonlEntryToSessionUpsert({
      sessionId: "sess-1",
      cwd: "/home/user/myproject",
      gitBranch: "feature/auth",
      isSidechain: false,
      firstPrompt: "Fix the auth bug",
      messageCount: 5,
      startedAt: "2025-03-15T10:00:00.000Z",
      lastSeenAt: "2025-03-15T12:00:00.000Z",
      jsonlPath: "/path/to/sess-1.jsonl",
      fileMtimeMs: 1700000000000,
    });

    expect(upsert.claude_session_id).toBe("sess-1");
    expect(upsert.first_prompt).toBe("Fix the auth bug");
    expect(upsert.summary).toBeNull();
    expect(upsert.custom_title).toBeNull();
    expect(upsert.message_count).toBe(5);
    expect(upsert.is_sidechain).toBe(false);
    expect(upsert.project_path).toBe("/home/user/myproject");
    expect(upsert.repo_name).toBe("myproject");
    expect(upsert.git_branch).toBe("feature/auth");
    expect(upsert.jsonl_path).toBe("/path/to/sess-1.jsonl");
    expect(upsert.started_at).toBe("2025-03-15T10:00:00.000Z");
    expect(upsert.last_seen_at).toBe("2025-03-15T12:00:00.000Z");
  });

  it("applies enrichment from sessions-index.json", () => {
    const upsert = jsonlEntryToSessionUpsert(
      {
        sessionId: "sess-1",
        cwd: "/project",
        gitBranch: "main",
        isSidechain: false,
        firstPrompt: "Test",
        messageCount: 1,
        startedAt: "2025-03-15T10:00:00.000Z",
        lastSeenAt: "2025-03-15T10:00:00.000Z",
        jsonlPath: "/path.jsonl",
        fileMtimeMs: 0,
      },
      { summary: "Auth debugging session", customTitle: "Auth Fix" },
    );

    expect(upsert.summary).toBe("Auth debugging session");
    expect(upsert.custom_title).toBe("Auth Fix");
  });

  it("handles empty cwd", () => {
    const upsert = jsonlEntryToSessionUpsert({
      sessionId: "sess-1",
      cwd: "",
      gitBranch: "",
      isSidechain: false,
      firstPrompt: "",
      messageCount: 0,
      startedAt: "",
      lastSeenAt: "",
      jsonlPath: "",
      fileMtimeMs: 0,
    });

    expect(upsert.project_path).toBeNull();
    expect(upsert.repo_name).toBeNull();
  });
});

describe("toSessionUpsert (legacy)", () => {
  it("maps fields correctly", () => {
    const entry = {
      sessionId: "abc-123",
      fullPath: "/path/to/session.jsonl",
      fileMtime: 1700000000000,
      firstPrompt: "Fix auth",
      summary: "Auth debugging",
      messageCount: 42,
      created: "2025-03-15T10:00:00.000Z",
      modified: "2025-03-15T12:00:00.000Z",
      gitBranch: "feature/auth",
      projectPath: "/home/user/myproject",
      isSidechain: false,
      customTitle: "My Session",
    };

    const upsert = toSessionUpsert(entry);

    expect(upsert.claude_session_id).toBe("abc-123");
    expect(upsert.first_prompt).toBe("Fix auth");
    expect(upsert.summary).toBe("Auth debugging");
    expect(upsert.custom_title).toBe("My Session");
    expect(upsert.message_count).toBe(42);
    expect(upsert.is_sidechain).toBe(false);
    expect(upsert.project_path).toBe("/home/user/myproject");
    expect(upsert.repo_name).toBe("myproject");
    expect(upsert.git_branch).toBe("feature/auth");
    expect(upsert.jsonl_path).toBe("/path/to/session.jsonl");
    expect(upsert.started_at).toBe("2025-03-15T10:00:00.000Z");
    expect(upsert.last_seen_at).toBe("2025-03-15T12:00:00.000Z");
  });

  it("derives repo_name from projectPath", () => {
    const entry = {
      sessionId: "x",
      fullPath: "",
      fileMtime: 0,
      firstPrompt: "",
      summary: "",
      messageCount: 0,
      created: "",
      modified: "",
      gitBranch: "",
      projectPath: "/deep/nested/path/to/repo",
      isSidechain: false,
      customTitle: "",
    };

    const upsert = toSessionUpsert(entry);
    expect(upsert.repo_name).toBe("repo");
  });

  it("handles empty projectPath", () => {
    const entry = {
      sessionId: "x",
      fullPath: "",
      fileMtime: 0,
      firstPrompt: "",
      summary: "",
      messageCount: 0,
      created: "",
      modified: "",
      gitBranch: "",
      projectPath: "",
      isSidechain: false,
      customTitle: "",
    };

    const upsert = toSessionUpsert(entry);
    expect(upsert.project_path).toBeNull();
    expect(upsert.repo_name).toBeNull();
  });
});
