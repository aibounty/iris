import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, SessionRepo, Indexer, ProjectRepo, TagRepo } from "@iris/core";
import { createProgram } from "../bin.js";
import type { CliContext } from "../context.js";
import type { SessionUpsert } from "@iris/core";

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

function createTestContext(): CliContext & { db: Database.Database } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  return {
    db,
    sessionRepo: new SessionRepo(db),
    projectRepo: new ProjectRepo(db),
    tagRepo: new TagRepo(db),
    indexer: new Indexer(db, { claudeDataDir: "/nonexistent" }),
    cleanup() {},
  };
}

describe("CLI mutation commands", () => {
  let ctx: ReturnType<typeof createTestContext>;
  let output: string[];

  beforeEach(() => {
    ctx = createTestContext();
    output = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    ctx.db.close();
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  function run(...args: string[]) {
    const program = createProgram(() => ctx);
    program.exitOverride();
    return program.parseAsync(["node", "iris", ...args]);
  }

  describe("note", () => {
    it("saves a note", async () => {
      const session = ctx.sessionRepo.upsert(
        makeUpsert({ claude_session_id: "s1" }),
      );

      await run("note", String(session.id), "stopped at retry policy");
      expect(output.join("\n")).toContain("Note saved");

      const updated = ctx.sessionRepo.findById(session.id)!;
      expect(updated.note).toBe("stopped at retry policy");
    });

    it("errors for non-existent session", async () => {
      await run("note", "999", "some note");
      expect(output.join("\n")).toContain("not found");
      expect(process.exitCode).toBe(2);
    });
  });

  describe("tag", () => {
    it("adds a tag", async () => {
      const session = ctx.sessionRepo.upsert(
        makeUpsert({ claude_session_id: "s1" }),
      );

      await run("tag", "add", String(session.id), "backend");
      expect(output.join("\n")).toContain("added");

      const updated = ctx.sessionRepo.findById(session.id)!;
      expect(updated.tags).toContain("backend");
    });

    it("removes a tag", async () => {
      const session = ctx.sessionRepo.upsert(
        makeUpsert({ claude_session_id: "s1" }),
      );
      ctx.sessionRepo.addTag(session.id, "backend");

      await run("tag", "remove", String(session.id), "backend");
      expect(output.join("\n")).toContain("removed");

      const updated = ctx.sessionRepo.findById(session.id)!;
      expect(updated.tags).not.toContain("backend");
    });
  });

  describe("pin/unpin", () => {
    it("pins and unpins a session", async () => {
      const session = ctx.sessionRepo.upsert(
        makeUpsert({ claude_session_id: "s1" }),
      );

      await run("pin", String(session.id));
      expect(output.join("\n")).toContain("pinned");
      expect(ctx.sessionRepo.findById(session.id)!.pinned).toBe(1);

      output = [];
      await run("unpin", String(session.id));
      expect(output.join("\n")).toContain("unpinned");
      expect(ctx.sessionRepo.findById(session.id)!.pinned).toBe(0);
    });
  });

  describe("archive/unarchive", () => {
    it("archives and unarchives a session", async () => {
      const session = ctx.sessionRepo.upsert(
        makeUpsert({ claude_session_id: "s1" }),
      );

      await run("archive", String(session.id));
      expect(output.join("\n")).toContain("archived");
      expect(ctx.sessionRepo.findById(session.id)!.status).toBe("archived");

      output = [];
      await run("unarchive", String(session.id));
      expect(output.join("\n")).toContain("unarchived");
      expect(ctx.sessionRepo.findById(session.id)!.status).toBe("active");
    });
  });

  describe("resolveSession", () => {
    it("resolves by numeric ID", async () => {
      const session = ctx.sessionRepo.upsert(
        makeUpsert({ claude_session_id: "s1", first_prompt: "My Session" }),
      );

      await run("show", String(session.id));
      expect(output.join("\n")).toContain("My Session");
    });

    it("resolves by UUID string", async () => {
      ctx.sessionRepo.upsert(
        makeUpsert({
          claude_session_id: "abc-def-ghi",
          first_prompt: "UUID Session",
        }),
      );

      await run("show", "abc-def-ghi");
      expect(output.join("\n")).toContain("UUID Session");
    });
  });
});
