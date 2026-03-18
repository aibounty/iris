import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, SessionRepo, Indexer, ProjectRepo, TagRepo } from "@iris/core";
import { createProgram } from "../bin.js";
import type { CliContext } from "../context.js";
import type { SessionUpsert } from "@iris/core";

// Mock the TerminalManager module
vi.mock("@iris/core", async () => {
  const actual = await vi.importActual<typeof import("@iris/core")>(
    "@iris/core",
  );
  return {
    ...actual,
    TerminalManager: class MockTerminalManager {
      async resolve() {
        return {
          name: "mock",
          isAvailable: async () => true,
          openSession: async () => {},
        };
      }
      async resume() {
        return { terminal: "mock" };
      }
    },
  };
});

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

describe("CLI resume commands", () => {
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

  describe("open", () => {
    it("resumes session by internal ID", async () => {
      const session = ctx.sessionRepo.upsert(
        makeUpsert({ claude_session_id: "sess-abc" }),
      );

      await run("open", String(session.id));
      const text = output.join("\n");
      expect(text).toContain("Resuming");
      expect(text).toContain("sess-abc");
    });

    it("errors for non-existent session", async () => {
      await run("open", "999");
      expect(output.join("\n")).toContain("not found");
      expect(process.exitCode).toBe(2);
    });
  });

  describe("resume", () => {
    it("resumes by Claude session ID", async () => {
      ctx.sessionRepo.upsert(
        makeUpsert({ claude_session_id: "sess-xyz" }),
      );

      await run("resume", "sess-xyz");
      const text = output.join("\n");
      expect(text).toContain("Resuming");
      expect(text).toContain("sess-xyz");
    });
  });

  describe("last", () => {
    it("resumes the most recent session", async () => {
      ctx.sessionRepo.upsert(
        makeUpsert({
          claude_session_id: "old-sess",
          last_seen_at: "2025-03-14T10:00:00.000Z",
          first_prompt: "Old session",
        }),
      );
      ctx.sessionRepo.upsert(
        makeUpsert({
          claude_session_id: "new-sess",
          last_seen_at: "2025-03-16T10:00:00.000Z",
          first_prompt: "New session",
        }),
      );

      await run("last");
      const text = output.join("\n");
      expect(text).toContain("New session");
    });

    it("shows error when no sessions exist", async () => {
      await run("last");
      expect(output.join("\n")).toContain("No sessions found");
      expect(process.exitCode).toBe(2);
    });
  });
});
