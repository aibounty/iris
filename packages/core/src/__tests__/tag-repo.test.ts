import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrate.js";
import { SessionRepo } from "../repo/session-repo.js";
import { TagRepo } from "../repo/tag-repo.js";
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

describe("TagRepo", () => {
  let db: Database.Database;
  let sessionRepo: SessionRepo;
  let tagRepo: TagRepo;

  beforeEach(() => {
    db = createTestDb();
    sessionRepo = new SessionRepo(db);
    tagRepo = new TagRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("lists tags with counts", () => {
    const s1 = sessionRepo.upsert(makeUpsert({ claude_session_id: "s1" }));
    const s2 = sessionRepo.upsert(makeUpsert({ claude_session_id: "s2" }));

    sessionRepo.addTag(s1.id, "backend");
    sessionRepo.addTag(s1.id, "bugfix");
    sessionRepo.addTag(s2.id, "backend");

    const tags = tagRepo.listTags();
    expect(tags).toHaveLength(2);

    const backend = tags.find((t) => t.name === "backend")!;
    expect(backend.count).toBe(2);

    const bugfix = tags.find((t) => t.name === "bugfix")!;
    expect(bugfix.count).toBe(1);
  });

  it("finds tag by name", () => {
    const s = sessionRepo.upsert(makeUpsert());
    sessionRepo.addTag(s.id, "backend");

    const tag = tagRepo.findByName("backend");
    expect(tag).not.toBeNull();
    expect(tag!.name).toBe("backend");
  });

  it("returns null for unknown tag", () => {
    expect(tagRepo.findByName("nonexistent")).toBeNull();
  });

  it("tags persist after removeTag (tag row not deleted)", () => {
    const s = sessionRepo.upsert(makeUpsert());
    sessionRepo.addTag(s.id, "temporary");
    sessionRepo.removeTag(s.id, "temporary");

    // Tag row still exists, just unlinked
    const tag = tagRepo.findByName("temporary");
    expect(tag).not.toBeNull();
  });
});
