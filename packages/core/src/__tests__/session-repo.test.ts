import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";
import { SessionRepo } from "../repo/session-repo.js";
import type { SessionUpsert } from "../repo/types.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function makeUpsert(overrides: Partial<SessionUpsert> = {}): SessionUpsert {
  return {
    claude_session_id: `test-${Math.random().toString(36).slice(2)}`,
    first_prompt: "Fix the auth bug",
    summary: "Debugged authentication token refresh",
    custom_title: null,
    message_count: 10,
    is_sidechain: false,
    project_path: "/home/user/myproject",
    repo_name: "myproject",
    git_branch: "main",
    jsonl_path: "/home/user/.claude/projects/-home-user-myproject/session.jsonl",
    started_at: "2025-03-15T10:00:00.000Z",
    last_seen_at: "2025-03-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("SessionRepo", () => {
  let db: Database.Database;
  let repo: SessionRepo;

  beforeEach(() => {
    db = createTestDb();
    repo = new SessionRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("upsert", () => {
    it("inserts a new session", () => {
      const data = makeUpsert({ claude_session_id: "sess-001" });
      const session = repo.upsert(data);

      expect(session.id).toBe(1);
      expect(session.claude_session_id).toBe("sess-001");
      expect(session.first_prompt).toBe("Fix the auth bug");
      expect(session.summary).toBe("Debugged authentication token refresh");
      expect(session.message_count).toBe(10);
      expect(session.status).toBe("active");
      expect(session.pinned).toBe(0);
      expect(session.repo_name).toBe("myproject");
      expect(session.git_branch).toBe("main");
    });

    it("updates existing session on conflict", () => {
      const data = makeUpsert({ claude_session_id: "sess-001" });
      repo.upsert(data);

      const updated = repo.upsert({
        ...data,
        summary: "Updated summary",
        message_count: 20,
        last_seen_at: "2025-03-16T10:00:00.000Z",
      });

      expect(updated.id).toBe(1);
      expect(updated.summary).toBe("Updated summary");
      expect(updated.message_count).toBe(20);
      expect(updated.last_seen_at).toBe("2025-03-16T10:00:00.000Z");
    });

    it("preserves user fields (note, pinned) on re-upsert", () => {
      const data = makeUpsert({ claude_session_id: "sess-001" });
      const session = repo.upsert(data);

      repo.updateNote(session.id, "my important note");
      repo.updatePin(session.id, true);

      // Re-upsert from indexer
      repo.upsert({
        ...data,
        message_count: 30,
      });

      const found = repo.findById(session.id)!;
      expect(found.note).toBe("my important note");
      expect(found.pinned).toBe(1);
      expect(found.message_count).toBe(30);
    });

    it("upserts project record", () => {
      const data = makeUpsert();
      repo.upsert(data);

      const project = db
        .prepare("SELECT * FROM projects WHERE project_path = ?")
        .get(data.project_path) as { repo_name: string };
      expect(project.repo_name).toBe("myproject");
    });
  });

  describe("findById", () => {
    it("returns session with tags", () => {
      const session = repo.upsert(makeUpsert());
      repo.addTag(session.id, "backend");

      const found = repo.findById(session.id)!;
      expect(found).not.toBeNull();
      expect(found.tags).toEqual(["backend"]);
    });

    it("returns null for non-existent id", () => {
      expect(repo.findById(999)).toBeNull();
    });
  });

  describe("findByClaudeId", () => {
    it("returns session by claude_session_id", () => {
      repo.upsert(makeUpsert({ claude_session_id: "abc-def" }));
      const found = repo.findByClaudeId("abc-def")!;
      expect(found.claude_session_id).toBe("abc-def");
    });

    it("returns null for non-existent claude id", () => {
      expect(repo.findByClaudeId("nonexistent")).toBeNull();
    });
  });

  describe("list", () => {
    beforeEach(() => {
      repo.upsert(
        makeUpsert({
          claude_session_id: "s1",
          repo_name: "projectA",
          git_branch: "main",
          last_seen_at: "2025-03-15T10:00:00.000Z",
          first_prompt: "Fix auth bug",
          summary: "Authentication debugging session",
        }),
      );
      repo.upsert(
        makeUpsert({
          claude_session_id: "s2",
          repo_name: "projectA",
          git_branch: "feature",
          last_seen_at: "2025-03-16T10:00:00.000Z",
          first_prompt: "Add redis caching",
          summary: "Redis migration work",
        }),
      );
      repo.upsert(
        makeUpsert({
          claude_session_id: "s3",
          repo_name: "projectB",
          git_branch: "main",
          last_seen_at: "2025-03-17T10:00:00.000Z",
          first_prompt: "Setup CI pipeline",
          summary: "CI/CD configuration",
        }),
      );
    });

    it("returns all sessions ordered by last_seen_at desc", () => {
      const result = repo.list();
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.items[0]!.claude_session_id).toBe("s3");
      expect(result.items[2]!.claude_session_id).toBe("s1");
    });

    it("filters by repo", () => {
      const result = repo.list({ repo: "projectA" });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("filters by branch", () => {
      const result = repo.list({ branch: "feature" });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.claude_session_id).toBe("s2");
    });

    it("filters by pinned", () => {
      const s1 = repo.findByClaudeId("s1")!;
      repo.updatePin(s1.id, true);

      const result = repo.list({ pinned: true });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.claude_session_id).toBe("s1");
    });

    it("filters by tag", () => {
      const s2 = repo.findByClaudeId("s2")!;
      repo.addTag(s2.id, "redis");

      const result = repo.list({ tag: "redis" });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.claude_session_id).toBe("s2");
    });

    it("searches with FTS", () => {
      const result = repo.list({ q: "redis" });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.claude_session_id).toBe("s2");
    });

    it("applies limit and offset", () => {
      const result = repo.list({ limit: 2, offset: 1 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(1);
      expect(result.items[0]!.claude_session_id).toBe("s2");
    });

    it("excludes archived by default", () => {
      const s1 = repo.findByClaudeId("s1")!;
      repo.updateArchive(s1.id, true);

      const result = repo.list();
      expect(result.items).toHaveLength(2);
    });

    it("includes archived when filter set", () => {
      const s1 = repo.findByClaudeId("s1")!;
      repo.updateArchive(s1.id, true);

      const result = repo.list({ archived: true });
      expect(result.items).toHaveLength(3);
    });

    it("sorts by created (started_at desc)", () => {
      // s1 started_at is from makeUpsert default (2025-03-15T10:00:00.000Z)
      // The beforeEach uses same started_at for all; override one to be newer
      repo.upsert(
        makeUpsert({
          claude_session_id: "s4",
          repo_name: "projectC",
          git_branch: "main",
          started_at: "2025-03-20T10:00:00.000Z",
          last_seen_at: "2025-03-14T10:00:00.000Z", // old last_seen
        }),
      );
      const result = repo.list({ sort: "created" });
      expect(result.items[0]!.claude_session_id).toBe("s4");
    });

    it("sorts by messages", () => {
      // Update message counts
      repo.upsert(
        makeUpsert({
          claude_session_id: "s1",
          repo_name: "projectA",
          git_branch: "main",
          message_count: 100,
          last_seen_at: "2025-03-15T10:00:00.000Z",
        }),
      );

      const result = repo.list({ sort: "messages" });
      expect(result.items[0]!.claude_session_id).toBe("s1");
    });
  });

  describe("updateNote", () => {
    it("saves and retrieves note", () => {
      const session = repo.upsert(makeUpsert());
      repo.updateNote(session.id, "stopped at retry policy");

      const found = repo.findById(session.id)!;
      expect(found.note).toBe("stopped at retry policy");
    });

    it("throws for non-existent session", () => {
      expect(() => repo.updateNote(999, "test")).toThrow("not found");
    });
  });

  describe("tags", () => {
    it("adds and retrieves tags", () => {
      const session = repo.upsert(makeUpsert());
      repo.addTag(session.id, "backend");
      repo.addTag(session.id, "bugfix");

      const found = repo.findById(session.id)!;
      expect(found.tags).toEqual(["backend", "bugfix"]);
    });

    it("removes a tag", () => {
      const session = repo.upsert(makeUpsert());
      repo.addTag(session.id, "backend");
      repo.addTag(session.id, "bugfix");
      repo.removeTag(session.id, "backend");

      const found = repo.findById(session.id)!;
      expect(found.tags).toEqual(["bugfix"]);
    });

    it("adding same tag twice is idempotent", () => {
      const session = repo.upsert(makeUpsert());
      repo.addTag(session.id, "backend");
      repo.addTag(session.id, "backend");

      const found = repo.findById(session.id)!;
      expect(found.tags).toEqual(["backend"]);
    });

    it("throws when adding tag to non-existent session", () => {
      expect(() => repo.addTag(999, "test")).toThrow("not found");
    });
  });

  describe("updatePin", () => {
    it("pins and unpins", () => {
      const session = repo.upsert(makeUpsert());

      repo.updatePin(session.id, true);
      expect(repo.findById(session.id)!.pinned).toBe(1);

      repo.updatePin(session.id, false);
      expect(repo.findById(session.id)!.pinned).toBe(0);
    });
  });

  describe("updateArchive", () => {
    it("archives and unarchives", () => {
      const session = repo.upsert(makeUpsert());

      repo.updateArchive(session.id, true);
      const archived = repo.findById(session.id)!;
      expect(archived.status).toBe("archived");
      expect(archived.archived_at).not.toBeNull();

      repo.updateArchive(session.id, false);
      const unarchived = repo.findById(session.id)!;
      expect(unarchived.status).toBe("active");
      expect(unarchived.archived_at).toBeNull();
    });
  });

  describe("getLatestByProjectPath", () => {
    it("returns most recent session for project", () => {
      repo.upsert(
        makeUpsert({
          claude_session_id: "old",
          project_path: "/proj",
          last_seen_at: "2025-03-15T10:00:00.000Z",
        }),
      );
      repo.upsert(
        makeUpsert({
          claude_session_id: "new",
          project_path: "/proj",
          last_seen_at: "2025-03-16T10:00:00.000Z",
        }),
      );

      const latest = repo.getLatestByProjectPath("/proj")!;
      expect(latest.claude_session_id).toBe("new");
    });

    it("returns null for unknown project", () => {
      expect(repo.getLatestByProjectPath("/unknown")).toBeNull();
    });
  });

  describe("delete", () => {
    it("removes session", () => {
      const session = repo.upsert(makeUpsert());
      repo.delete(session.id);
      expect(repo.findById(session.id)).toBeNull();
    });
  });
});
