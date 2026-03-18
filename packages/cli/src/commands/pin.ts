import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { resolveSession } from "./show.js";

export function registerPinCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("pin <id>")
    .description("Pin a session")
    .action((id) => {
      const ctx = getCtx();
      try {
        const session = resolveSession(ctx, id);
        ctx.sessionRepo.updatePin(session.id, true);
        console.log(`Session #${session.id} pinned`);
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
    .command("unpin <id>")
    .description("Unpin a session")
    .action((id) => {
      const ctx = getCtx();
      try {
        const session = resolveSession(ctx, id);
        ctx.sessionRepo.updatePin(session.id, false);
        console.log(`Session #${session.id} unpinned`);
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
