import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, SessionRepo, Indexer } from "@iris/core";
import { ProjectRepo, TagRepo } from "@iris/core";
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

  const sessionRepo = new SessionRepo(db);
  const projectRepo = new ProjectRepo(db);
  const tagRepo = new TagRepo(db);
  // Indexer with non-existent dir — scan returns 0 sessions
  const indexer = new Indexer(db, { claudeDataDir: "/nonexistent" });

  return {
    db,
    sessionRepo,
    projectRepo,
    tagRepo,
    indexer,
    cleanup() {
      /* no-op in tests */
    },
  };
}

describe("CLI commands", () => {
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
  });

  function run(...args: string[]) {
    const program = createProgram(() => ctx);
    program.exitOverride();
    return program.parseAsync(["node", "iris", ...args]);
  }

  describe("list", () => {
    it("shows sessions", async () => {
      ctx.sessionRepo.upsert(makeUpsert({ claude_session_id: "s1", first_prompt: "Fix auth bug" }));
      ctx.sessionRepo.upsert(makeUpsert({ claude_session_id: "s2", first_prompt: "Add caching" }));

      await run("list");
      const text = output.join("\n");
      expect(text).toContain("Fix auth bug");
      expect(text).toContain("Add caching");
    });

    it("filters by repo", async () => {
      ctx.sessionRepo.upsert(makeUpsert({ claude_session_id: "s1", repo_name: "alpha" }));
      ctx.sessionRepo.upsert(makeUpsert({ claude_session_id: "s2", repo_name: "beta" }));

      await run("list", "--repo", "alpha");
      const text = output.join("\n");
      expect(text).not.toContain("beta");
    });

    it("outputs JSON", async () => {
      ctx.sessionRepo.upsert(makeUpsert({ claude_session_id: "s1" }));

      await run("list", "--json");
      const parsed = JSON.parse(output.join(""));
      expect(parsed.items).toHaveLength(1);
      expect(parsed.total).toBe(1);
    });

    it("shows empty state", async () => {
      await run("list");
      const text = output.join("\n");
      expect(text).toContain("No sessions found");
    });
  });

  describe("show", () => {
    it("shows session details", async () => {
      const session = ctx.sessionRepo.upsert(
        makeUpsert({ claude_session_id: "abc-def", first_prompt: "Fix auth" }),
      );

      await run("show", String(session.id));
      const text = output.join("\n");
      expect(text).toContain("abc-def");
      expect(text).toContain("Fix auth");
    });

    it("handles non-existent session", async () => {
      await run("show", "999");
      const text = output.join("\n");
      expect(text).toContain("not found");
      expect(process.exitCode).toBe(2);
      process.exitCode = undefined;
    });

    it("resolves by UUID", async () => {
      ctx.sessionRepo.upsert(
        makeUpsert({ claude_session_id: "my-uuid-123", first_prompt: "UUID session" }),
      );

      await run("show", "my-uuid-123");
      const text = output.join("\n");
      expect(text).toContain("UUID session");
    });
  });

  describe("search", () => {
    it("finds sessions by keyword", async () => {
      ctx.sessionRepo.upsert(
        makeUpsert({
          claude_session_id: "s1",
          first_prompt: "Fix authentication bug",
          summary: "Debugged auth token refresh",
        }),
      );
      ctx.sessionRepo.upsert(
        makeUpsert({
          claude_session_id: "s2",
          first_prompt: "Add redis caching",
          summary: "Redis integration work",
        }),
      );

      await run("search", "redis");
      const text = output.join("\n");
      expect(text).toContain("redis");
      expect(text).not.toContain("authentication");
    });

    it("shows empty message when no results", async () => {
      await run("search", "nonexistent");
      const text = output.join("\n");
      expect(text).toContain("No sessions found");
    });
  });

  describe("scan", () => {
    it("reports scan results", async () => {
      await run("scan");
      const text = output.join("\n");
      expect(text).toContain("Scanned");
      expect(text).toContain("sessions");
    });
  });
});
