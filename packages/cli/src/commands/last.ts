import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { TerminalManager } from "@iris/core";
import type { TerminalPreference } from "@iris/core";

export function registerLastCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("last")
    .description("Resume the most recently modified session")
    .option(
      "--terminal <type>",
      "Terminal: auto, iterm, terminal_app, kitty, shell",
      "auto",
    )
    .action(async (opts) => {
      const ctx = getCtx();
      try {
        // Scan first to get latest data
        ctx.indexer.scan();

        const result = ctx.sessionRepo.list({ limit: 1 });
        if (result.items.length === 0) {
          console.error("No sessions found");
          process.exitCode = 2;
          return;
        }

        const session = result.items[0]!;
        const manager = new TerminalManager(
          opts.terminal as TerminalPreference,
        );
        console.log(
          `Resuming latest session #${session.id}: ${session.custom_title || session.first_prompt || session.claude_session_id}`,
        );
        const { terminal } = await manager.resume(
          session.claude_session_id,
          session.project_path ?? undefined,
        );
        console.log(`Opened in ${terminal}`);
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
