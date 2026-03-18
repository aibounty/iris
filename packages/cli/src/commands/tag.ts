import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { resolveSession } from "./show.js";

export function registerTagCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  const tag = program
    .command("tag")
    .description("Manage session tags");

  tag
    .command("add <id> <tag>")
    .description("Add a tag to a session")
    .action((id, tagName) => {
      const ctx = getCtx();
      try {
        const session = resolveSession(ctx, id);
        ctx.sessionRepo.addTag(session.id, tagName);
        console.log(`Tag "${tagName}" added to session #${session.id}`);
      } catch (err) {
        console.error(
          err instanceof Error ? err.message : String(err),
        );
        process.exitCode = 2;
      } finally {
        ctx.cleanup();
      }
    });

  tag
    .command("remove <id> <tag>")
    .description("Remove a tag from a session")
    .action((id, tagName) => {
      const ctx = getCtx();
      try {
        const session = resolveSession(ctx, id);
        ctx.sessionRepo.removeTag(session.id, tagName);
        console.log(
          `Tag "${tagName}" removed from session #${session.id}`,
        );
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
