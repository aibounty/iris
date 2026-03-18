import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, SessionRepo } from "@iris/core";
import type { SessionUpsert } from "@iris/core";
import { resolveCurrentSession } from "../current-session.js";

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

describe("resolveCurrentSession", () => {
  let db: Database.Database;
  let repo: SessionRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new SessionRepo(db);
  });

  afterEach(() => {
    db.close();
    delete process.env["IRIS_SESSION_ID"];
  });

  it("resolves via IRIS_SESSION_ID env var", () => {
    repo.upsert(
      makeUpsert({
        claude_session_id: "env-session",
        first_prompt: "Env session",
      }),
    );

    process.env["IRIS_SESSION_ID"] = "env-session";
    const session = resolveCurrentSession(repo);
    expect(session.claude_session_id).toBe("env-session");
  });

  it("resolves via cwd matching project_path", () => {
    const cwd = process.cwd();
    repo.upsert(
      makeUpsert({
        claude_session_id: "cwd-session",
        project_path: cwd,
        last_seen_at: "2025-03-16T10:00:00.000Z",
      }),
    );

    const session = resolveCurrentSession(repo);
    expect(session.claude_session_id).toBe("cwd-session");
  });

  it("throws when no session can be determined", () => {
    expect(() => resolveCurrentSession(repo)).toThrow(
      "Cannot determine current session",
    );
  });

  it("IRIS_SESSION_ID takes priority over cwd", () => {
    const cwd = process.cwd();
    repo.upsert(
      makeUpsert({
        claude_session_id: "env-session",
        project_path: "/other/path",
      }),
    );
    repo.upsert(
      makeUpsert({
        claude_session_id: "cwd-session",
        project_path: cwd,
      }),
    );

    process.env["IRIS_SESSION_ID"] = "env-session";
    const session = resolveCurrentSession(repo);
    expect(session.claude_session_id).toBe("env-session");
  });
});
