import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { resolveSession } from "./show.js";
import { TerminalManager } from "@iris/core";
import type { TerminalPreference } from "@iris/core";

export function registerOpenCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("open <id>")
    .description("Resume a session by internal ID")
    .option(
      "--terminal <type>",
      "Terminal: auto, iterm, terminal_app, kitty, shell",
      "auto",
    )
    .action(async (id, opts) => {
      const ctx = getCtx();
      try {
        const session = resolveSession(ctx, id);
        const manager = new TerminalManager(
          opts.terminal as TerminalPreference,
        );
        console.log(
          `Resuming session #${session.id} (${session.claude_session_id})...`,
        );
        const result = await manager.resume(
          session.claude_session_id,
          session.project_path ?? undefined,
        );
        console.log(`Opened in ${result.terminal}`);
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
