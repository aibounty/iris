import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { TerminalManager } from "@iris/core";
import type { TerminalPreference } from "@iris/core";

export function registerResumeCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("resume <claude_session_id>")
    .description("Resume a session by Claude session ID")
    .option(
      "--terminal <type>",
      "Terminal: auto, iterm, terminal_app, kitty, shell",
      "auto",
    )
    .action(async (claudeSessionId, opts) => {
      const ctx = getCtx();
      try {
        // Try to find project path from DB for better context
        const session =
          ctx.sessionRepo.findByClaudeId(claudeSessionId);
        const projectPath = session?.project_path ?? undefined;

        const manager = new TerminalManager(
          opts.terminal as TerminalPreference,
        );
        console.log(`Resuming session ${claudeSessionId}...`);
        const result = await manager.resume(
          claudeSessionId,
          projectPath,
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
