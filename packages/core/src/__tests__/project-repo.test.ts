import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";
import { SessionRepo } from "../repo/session-repo.js";
import { ProjectRepo } from "../repo/project-repo.js";
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
    first_prompt: "Test prompt",
    summary: "Test summary",
    custom_title: null,
    message_count: 5,
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

describe("ProjectRepo", () => {
  let db: Database.Database;
  let sessionRepo: SessionRepo;
  let projectRepo: ProjectRepo;

  beforeEach(() => {
    db = createTestDb();
    sessionRepo = new SessionRepo(db);
    projectRepo = new ProjectRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("lists projects with session counts", () => {
    sessionRepo.upsert(
      makeUpsert({
        project_path: "/proj/a",
        repo_name: "a",
        claude_session_id: "s1",
      }),
    );
    sessionRepo.upsert(
      makeUpsert({
        project_path: "/proj/a",
        repo_name: "a",
        claude_session_id: "s2",
      }),
    );
    sessionRepo.upsert(
      makeUpsert({
        project_path: "/proj/b",
        repo_name: "b",
        claude_session_id: "s3",
      }),
    );

    const projects = projectRepo.listProjects();
    expect(projects).toHaveLength(2);

    const projA = projects.find((p) => p.repo_name === "a")!;
    expect(projA.session_count).toBe(2);

    const projB = projects.find((p) => p.repo_name === "b")!;
    expect(projB.session_count).toBe(1);
  });

  it("finds project by path", () => {
    sessionRepo.upsert(
      makeUpsert({ project_path: "/proj/a", repo_name: "a" }),
    );

    const project = projectRepo.findByPath("/proj/a");
    expect(project).not.toBeNull();
    expect(project!.repo_name).toBe("a");
  });

  it("returns null for unknown path", () => {
    expect(projectRepo.findByPath("/unknown")).toBeNull();
  });
});
