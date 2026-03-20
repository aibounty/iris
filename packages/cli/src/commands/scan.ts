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
        const parts = [
          `${result.newSessions} new`,
          `${result.updated} updated`,
        ];
        if (result.skipped > 0) {
          parts.push(`${result.skipped} unchanged`);
        }
        if (result.pruned > 0) {
          parts.push(`${result.pruned} pruned`);
        }
        console.log(
          `Scanned ${result.total} sessions (${parts.join(", ")}) in ${result.durationMs}ms`,
        );
        if (result.errors > 0) {
          console.error(`${result.errors} errors during scan`);
        }
      } finally {
        ctx.cleanup();
      }
    });
}
