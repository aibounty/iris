import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { resolveSession } from "./show.js";

export function registerNoteCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("note <id> <text>")
    .description("Add or update a note on a session")
    .action((id, text) => {
      const ctx = getCtx();
      try {
        const session = resolveSession(ctx, id);
        ctx.sessionRepo.updateNote(session.id, text);
        console.log(`Note saved for session #${session.id}`);
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
