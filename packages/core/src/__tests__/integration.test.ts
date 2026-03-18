import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { runMigrations } from "../db/index.js";
import { SessionRepo } from "../repo/session-repo.js";
import { ProjectRepo } from "../repo/project-repo.js";
import { TagRepo } from "../repo/tag-repo.js";
import { Indexer } from "../indexer/indexer.js";

function createMockSessionIndex(sessions: Array<{
  id: string;
  prompt: string;
  summary: string;
  branch: string;
  projectPath: string;
  messageCount?: number;
  isSidechain?: boolean;
}>): string {
  return JSON.stringify({
    version: 1,
    entries: sessions.map((s) => ({
      sessionId: s.id,
      fullPath: `/mock/${s.id}.jsonl`,
      fileMtime: Date.now(),
      firstPrompt: s.prompt,
      summary: s.summary,
      messageCount: s.messageCount ?? 10,
      created: "2025-03-15T10:00:00.000Z",
      modified: "2025-03-15T12:00:00.000Z",
      gitBranch: s.branch,
      projectPath: s.projectPath,
      isSidechain: s.isSidechain ?? false,
      customTitle: null,
    })),
    originalPath: sessions[0]?.projectPath ?? "/unknown",
  });
}

describe("Full pipeline integration", () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = join(tmpdir(), `iris-integration-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("indexes sessions from multiple projects and preserves user data on re-scan", () => {
    // Create 3 projects with multiple sessions
    const projectsDir = join(tempDir, "projects");

    // Project 1: web-app (4 sessions)
    const proj1Dir = join(projectsDir, "-Volumes-code-web-app");
    mkdirSync(proj1Dir, { recursive: true });
    writeFileSync(
      join(proj1Dir, "sessions-index.json"),
      createMockSessionIndex([
        { id: "sess-1", prompt: "Fix auth bug", summary: "Debugged JWT refresh", branch: "main", projectPath: "/Volumes/code/web-app" },
        { id: "sess-2", prompt: "Add dark mode", summary: "Implemented theme system", branch: "feature/dark-mode", projectPath: "/Volumes/code/web-app" },
        { id: "sess-3", prompt: "Refactor API", summary: "Cleaned up endpoints", branch: "main", projectPath: "/Volumes/code/web-app" },
        { id: "sess-4", prompt: "Write tests", summary: "Added unit tests for auth", branch: "main", projectPath: "/Volumes/code/web-app", messageCount: 25 },
      ]),
    );

    // Project 2: backend-api (3 sessions)
    const proj2Dir = join(projectsDir, "-Volumes-code-backend-api");
    mkdirSync(proj2Dir, { recursive: true });
    writeFileSync(
      join(proj2Dir, "sessions-index.json"),
      createMockSessionIndex([
        { id: "sess-5", prompt: "Set up database", summary: "Created PostgreSQL schema", branch: "main", projectPath: "/Volumes/code/backend-api" },
        { id: "sess-6", prompt: "Add caching layer", summary: "Redis caching for queries", branch: "feature/caching", projectPath: "/Volumes/code/backend-api" },
        { id: "sess-7", prompt: "Fix memory leak", summary: "Found connection pool issue", branch: "hotfix/memory", projectPath: "/Volumes/code/backend-api", isSidechain: true },
      ]),
    );

    // Project 3: mobile-app (3 sessions)
    const proj3Dir = join(projectsDir, "-Volumes-code-mobile-app");
    mkdirSync(proj3Dir, { recursive: true });
    writeFileSync(
      join(proj3Dir, "sessions-index.json"),
      createMockSessionIndex([
        { id: "sess-8", prompt: "Build login screen", summary: "React Native login", branch: "main", projectPath: "/Volumes/code/mobile-app" },
        { id: "sess-9", prompt: "Push notifications", summary: "Firebase push setup", branch: "feature/notifications", projectPath: "/Volumes/code/mobile-app" },
        { id: "sess-10", prompt: "Performance optimization", summary: "Reduced bundle size", branch: "main", projectPath: "/Volumes/code/mobile-app", messageCount: 50 },
      ]),
    );

    const indexer = new Indexer(db, { claudeDataDir: tempDir });
    const sessionRepo = new SessionRepo(db);
    const projectRepo = new ProjectRepo(db);
    const tagRepo = new TagRepo(db);

    // First scan
    const result1 = indexer.scan();
    expect(result1.total).toBe(10);
    expect(result1.newSessions).toBe(10);
    expect(result1.updated).toBe(0);
    expect(result1.errors).toBe(0);

    // Verify all sessions indexed (sidechains excluded by default in list)
    const allSessions = sessionRepo.list({ limit: 50, sidechains: true });
    expect(allSessions.total).toBe(10);

    // Verify projects
    const projects = projectRepo.listProjects();
    expect(projects).toHaveLength(3);
    const webApp = projects.find((p) => p.repo_name === "web-app");
    expect(webApp).toBeDefined();
    expect(webApp!.session_count).toBe(4);

    // Add user data
    const sess1 = sessionRepo.findByClaudeId("sess-1");
    expect(sess1).toBeDefined();
    sessionRepo.updateNote(sess1!.id, "stopped at retry logic");
    sessionRepo.updatePin(sess1!.id, true);
    sessionRepo.addTag(sess1!.id, "important");
    sessionRepo.addTag(sess1!.id, "auth");

    const sess5 = sessionRepo.findByClaudeId("sess-5");
    sessionRepo.addTag(sess5!.id, "backend");
    sessionRepo.updateNote(sess5!.id, "schema v2 draft");

    // Re-scan
    const result2 = indexer.scan();
    expect(result2.total).toBe(10);
    expect(result2.newSessions).toBe(0);
    expect(result2.updated).toBe(10);

    // Verify user data preserved
    const sess1After = sessionRepo.findByClaudeId("sess-1")!;
    expect(sess1After.note).toBe("stopped at retry logic");
    expect(sess1After.pinned).toBe(1);
    expect(sess1After.tags).toContain("important");
    expect(sess1After.tags).toContain("auth");

    const sess5After = sessionRepo.findByClaudeId("sess-5")!;
    expect(sess5After.note).toBe("schema v2 draft");
    expect(sess5After.tags).toContain("backend");

    // FTS search
    const authResults = sessionRepo.list({ q: "auth" });
    expect(authResults.total).toBeGreaterThanOrEqual(2); // "Fix auth bug" and "Added unit tests for auth"

    const redisResults = sessionRepo.list({ q: "Redis" });
    expect(redisResults.total).toBeGreaterThanOrEqual(1);

    // Filter by repo
    const webAppSessions = sessionRepo.list({ repo: "web-app" });
    expect(webAppSessions.total).toBe(4);

    // Filter by branch
    const mainSessions = sessionRepo.list({ branch: "main" });
    expect(mainSessions.total).toBeGreaterThanOrEqual(5); // multiple "main" branches across projects

    // Pagination (sidechains excluded by default, so total = 9)
    const page1 = sessionRepo.list({ limit: 3, offset: 0 });
    expect(page1.items).toHaveLength(3);
    expect(page1.total).toBe(9);

    const page2 = sessionRepo.list({ limit: 3, offset: 3 });
    expect(page2.items).toHaveLength(3);

    // Tag list with counts
    const tags = tagRepo.listTags();
    expect(tags).toHaveLength(3); // important, auth, backend
    const authTag = tags.find((t) => t.name === "auth");
    expect(authTag).toBeDefined();
    expect(authTag!.count).toBe(1);

    // Filter by tag
    const importantSessions = sessionRepo.list({ tag: "important" });
    expect(importantSessions.total).toBe(1);

    // Filter by pinned
    const pinnedSessions = sessionRepo.list({ pinned: true });
    expect(pinnedSessions.total).toBe(1);
    expect(pinnedSessions.items[0].claude_session_id).toBe("sess-1");
  });

  it("handles unicode in notes and tags", () => {
    const sessionRepo = new SessionRepo(db);
    const projectsDir = join(tempDir, "projects");
    const projDir = join(projectsDir, "-test");
    mkdirSync(projDir, { recursive: true });
    writeFileSync(
      join(projDir, "sessions-index.json"),
      createMockSessionIndex([
        { id: "unicode-sess", prompt: "Test unicode", summary: "Testing", branch: "main", projectPath: "/test" },
      ]),
    );

    const indexer = new Indexer(db, { claudeDataDir: tempDir });
    indexer.scan();

    const session = sessionRepo.findByClaudeId("unicode-sess")!;

    // Unicode note
    sessionRepo.updateNote(session.id, "中文测试 日本語テスト 한국어 тест");
    const updated = sessionRepo.findById(session.id)!;
    expect(updated.note).toBe("中文测试 日本語テスト 한국어 тест");

    // Unicode tag
    sessionRepo.addTag(session.id, "バグ修正");
    const withTag = sessionRepo.findById(session.id)!;
    expect(withTag.tags).toContain("バグ修正");
  });

  it("handles empty database gracefully", () => {
    const sessionRepo = new SessionRepo(db);
    const projectRepo = new ProjectRepo(db);
    const tagRepo = new TagRepo(db);

    const sessions = sessionRepo.list({});
    expect(sessions.total).toBe(0);
    expect(sessions.items).toHaveLength(0);

    const projects = projectRepo.listProjects();
    expect(projects).toHaveLength(0);

    const tags = tagRepo.listTags();
    expect(tags).toHaveLength(0);
  });
});
