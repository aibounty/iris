import type { Command } from "commander";
import type { CliContext } from "../context.js";

export function registerScanCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("scan")
    .description("Force re-index Claude Code sessions")
    .action(() => {
      const ctx = getCtx();
      try {
        const result = ctx.indexer.scan();
        console.log(
          `Scanned ${result.total} sessions (${result.newSessions} new, ${result.updated} updated) in ${result.durationMs}ms`,
        );
        if (result.errors > 0) {
          console.error(`${result.errors} errors during scan`);
        }
      } finally {
        ctx.cleanup();
      }
    });
}
