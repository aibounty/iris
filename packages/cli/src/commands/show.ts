import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { formatSessionDetail } from "../formatters.js";
import type { SessionWithTags } from "@iris/core";
import { resolveCurrentSession } from "../current-session.js";

export function resolveSession(
  ctx: CliContext,
  idOrUuid: string,
): SessionWithTags {
  // Handle "current" keyword
  if (idOrUuid === "current") {
    return resolveCurrentSession(ctx.sessionRepo);
  }

  // Try as numeric ID
  const numId = parseInt(idOrUuid, 10);
  if (!isNaN(numId) && String(numId) === idOrUuid) {
    const session = ctx.sessionRepo.findById(numId);
    if (!session) {
      throw new Error(`Session #${numId} not found`);
    }
    return session;
  }

  // Try as UUID
  const session = ctx.sessionRepo.findByClaudeId(idOrUuid);
  if (!session) {
    throw new Error(`Session with Claude ID "${idOrUuid}" not found`);
  }
  return session;
}

export function registerShowCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("show <id>")
    .description("Show session details")
    .option("--json", "Output as JSON")
    .action((id, opts) => {
      const ctx = getCtx();
      try {
        const session = resolveSession(ctx, id);

        if (opts.json) {
          console.log(JSON.stringify(session, null, 2));
        } else {
          console.log(formatSessionDetail(session));
        }
      } catch (err) {
        console.error(
          err instanceof Error ? err.message : String(err),
        );
        process.exitCode = 2;
      } finally {
        ctx.cleanup();
      }
    });
}
