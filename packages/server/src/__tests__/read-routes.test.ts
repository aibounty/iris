import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, SessionRepo } from "@iris/core";
import type { SessionUpsert } from "@iris/core";
import { createApp } from "../app.js";
import type { FastifyInstance } from "fastify";

function makeUpsert(overrides: Partial<SessionUpsert> = {}): SessionUpsert {
  return {
    claude_session_id: `test-${Math.random().toString(36).slice(2)}`,
    first_prompt: "Test prompt",
    summary: "Test summary",
    custom_title: null,
    message_count: 10,
    is_sidechain: false,
    project_path: "/home/user/myproject",
    repo_name: "myproject",
    git_branch: "main",
    jsonl_path: null,
    started_at: "2025-03-15T10:00:00.000Z",
    last_seen_at: "2025-03-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("Read routes", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let repo: SessionRepo;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new SessionRepo(db);

    app = await createApp({ db });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  describe("GET /api/health", () => {
    it("returns status and session count", async () => {
      repo.upsert(makeUpsert());
      repo.upsert(makeUpsert());

      const res = await app.inject({
        method: "GET",
        url: "/api/health",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.version).toBe("0.1.0");
      expect(body.sessions_count).toBe(2);
    });
  });

  describe("GET /api/sessions", () => {
    beforeEach(() => {
      repo.upsert(
        makeUpsert({
          claude_session_id: "s1",
          repo_name: "alpha",
          git_branch: "main",
          first_prompt: "Auth fix",
          summary: "Authentication debugging",
          last_seen_at: "2025-03-15T10:00:00.000Z",
        }),
      );
      repo.upsert(
        makeUpsert({
          claude_session_id: "s2",
          repo_name: "alpha",
          git_branch: "feature",
          first_prompt: "Redis caching",
          summary: "Redis integration",
          last_seen_at: "2025-03-16T10:00:00.000Z",
        }),
      );
      repo.upsert(
        makeUpsert({
          claude_session_id: "s3",
          repo_name: "beta",
          git_branch: "main",
          first_prompt: "CI setup",
          summary: "Pipeline configuration",
          last_seen_at: "2025-03-17T10:00:00.000Z",
        }),
      );
    });

    it("returns paginated list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessions).toHaveLength(3);
      expect(body.total).toBe(3);
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
    });

    it("filters by repo", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions?repo=alpha",
      });

      const body = res.json();
      expect(body.sessions).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it("searches with FTS", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions?q=redis",
      });

      const body = res.json();
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0].claude_session_id).toBe("s2");
    });

    it("filters by pinned", async () => {
      const s1 = repo.findByClaudeId("s1")!;
      repo.updatePin(s1.id, true);

      const res = await app.inject({
        method: "GET",
        url: "/api/sessions?pinned=true",
      });

      const body = res.json();
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0].claude_session_id).toBe("s1");
    });

    it("handles pagination", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions?limit=2&offset=1",
      });

      const body = res.json();
      expect(body.sessions).toHaveLength(2);
      expect(body.total).toBe(3);
      expect(body.offset).toBe(1);
    });
  });

  describe("GET /api/sessions/:id", () => {
    it("returns session detail", async () => {
      const session = repo.upsert(
        makeUpsert({
          claude_session_id: "detail-session",
          first_prompt: "Detailed session",
        }),
      );
      repo.addTag(session.id, "backend");

      const res = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.claude_session_id).toBe("detail-session");
      expect(body.tags).toContain("backend");
    });

    it("returns 404 for non-existent session", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/999",
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for invalid ID", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/sessions/abc",
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/projects", () => {
    it("returns projects with session counts", async () => {
      repo.upsert(
        makeUpsert({
          claude_session_id: "p1",
          project_path: "/proj/a",
          repo_name: "a",
        }),
      );
      repo.upsert(
        makeUpsert({
          claude_session_id: "p2",
          project_path: "/proj/a",
          repo_name: "a",
        }),
      );
      repo.upsert(
        makeUpsert({
          claude_session_id: "p3",
          project_path: "/proj/b",
          repo_name: "b",
        }),
      );

      const res = await app.inject({
        method: "GET",
        url: "/api/projects",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.projects).toHaveLength(2);

      const projA = body.projects.find(
        (p: { repo_name: string }) => p.repo_name === "a",
      );
      expect(projA.session_count).toBe(2);
    });
  });

  describe("GET /api/tags", () => {
    it("returns tags with counts", async () => {
      const s1 = repo.upsert(makeUpsert({ claude_session_id: "t1" }));
      const s2 = repo.upsert(makeUpsert({ claude_session_id: "t2" }));
      repo.addTag(s1.id, "backend");
      repo.addTag(s2.id, "backend");
      repo.addTag(s1.id, "bugfix");

      const res = await app.inject({
        method: "GET",
        url: "/api/tags",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.tags).toHaveLength(2);

      const backend = body.tags.find(
        (t: { name: string }) => t.name === "backend",
      );
      expect(backend.count).toBe(2);
    });
  });
});
