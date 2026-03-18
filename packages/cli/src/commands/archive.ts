import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { resolveSession } from "./show.js";

export function registerArchiveCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("archive <id>")
    .description("Archive a session")
    .action((id) => {
      const ctx = getCtx();
      try {
        const session = resolveSession(ctx, id);
        ctx.sessionRepo.updateArchive(session.id, true);
        console.log(`Session #${session.id} archived`);
      } catch (err) {
        console.error(
          err instanceof Error ? err.message : String(err),
        );
        process.exitCode = 2;
      } finally {
        ctx.cleanup();
      }
    });

  program
    .command("unarchive <id>")
    .description("Unarchive a session")
    .action((id) => {
      const ctx = getCtx();
      try {
        const session = resolveSession(ctx, id);
        ctx.sessionRepo.updateArchive(session.id, false);
        console.log(`Session #${session.id} unarchived`);
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
