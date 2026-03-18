import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { runMigrations, SessionRepo } from "@iris/core";
import type { SessionUpsert } from "@iris/core";
import { createApp } from "../app.js";
import { registerStaticRoutes } from "../static.js";
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

describe("Serve integration", () => {
  let db: Database.Database;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);

    const repo = new SessionRepo(db);
    repo.upsert(makeUpsert());
    repo.upsert(makeUpsert());
  });

  afterEach(async () => {
    if (app) await app.close();
    db.close();
  });

  it("creates a working app with all options", async () => {
    app = await createApp({
      db,
      authToken: "test-token",
      readonly: false,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.sessions_count).toBe(2);
  });

  it("serves /api/health with correct session count", async () => {
    const repo = new SessionRepo(db);
    repo.upsert(makeUpsert());

    app = await createApp({ db });

    const res = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    const body = res.json();
    expect(body.sessions_count).toBe(3);
  });

  it("serves static files and falls back to index.html", async () => {
    const tempDir = join(tmpdir(), `iris-static-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(
      join(tempDir, "index.html"),
      "<html><body>Iris</body></html>",
    );

    app = await createApp({ db });
    await registerStaticRoutes(app, { distPath: tempDir });

    // Should serve index.html for SPA routes
    const res = await app.inject({
      method: "GET",
      url: "/sessions/1",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Iris");

    // API 404 should still return JSON
    const apiRes = await app.inject({
      method: "GET",
      url: "/api/nonexistent",
    });

    expect(apiRes.statusCode).toBe(404);
    const apiBody = apiRes.json();
    expect(apiBody.error).toBe("Not found");

    rmSync(tempDir, { recursive: true, force: true });
  });
});
