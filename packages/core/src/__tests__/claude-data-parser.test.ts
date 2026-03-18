import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseSessionIndexFile,
  discoverProjectDirs,
  parseAllSessions,
  toSessionUpsert,
} from "../parser/claude-data-parser.js";

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

describe("parseAllSessions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "iris-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("aggregates sessions from multiple projects", () => {
    const projectsDir = join(tmpDir, "projects");
    mkdirSync(projectsDir);

    const proj1 = join(projectsDir, "-proj-a");
    mkdirSync(proj1);
    writeFileSync(
      join(proj1, "sessions-index.json"),
      makeIndexFile([
        makeEntry({ sessionId: "s1", projectPath: "/proj/a" }),
        makeEntry({ sessionId: "s2", projectPath: "/proj/a" }),
      ]),
    );

    const proj2 = join(projectsDir, "-proj-b");
    mkdirSync(proj2);
    writeFileSync(
      join(proj2, "sessions-index.json"),
      makeIndexFile([
        makeEntry({ sessionId: "s3", projectPath: "/proj/b" }),
      ]),
    );

    const entries = parseAllSessions(tmpDir);
    expect(entries).toHaveLength(3);
  });
});

describe("toSessionUpsert", () => {
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
