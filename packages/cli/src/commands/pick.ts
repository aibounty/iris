import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { toRelativeTime } from "../formatters.js";
import { TerminalManager } from "@iris/core";
import type { TerminalPreference, SessionWithTags } from "@iris/core";

export function formatPickerItem(s: SessionWithTags): string {
  const title = s.custom_title || s.first_prompt || "No title";
  const repo = s.repo_name || "—";
  const branch = s.git_branch || "—";
  const modified = toRelativeTime(s.last_seen_at);
  const pin = s.pinned ? " ★" : "";
  return `[${repo}] ${title} — ${branch} — ${modified}${pin}`;
}

export function registerPickCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("pick")
    .description("Interactive fuzzy session picker")
    .option(
      "--terminal <type>",
      "Terminal: auto, iterm, terminal_app, kitty, shell",
      "auto",
    )
    .action(async (opts) => {
      const ctx = getCtx();
      try {
        if (!process.stdin.isTTY) {
          console.error(
            "Interactive picker requires a TTY. Use iris list instead.",
          );
          process.exitCode = 1;
          return;
        }

        // Scan first
        ctx.indexer.scan();

        const result = ctx.sessionRepo.list({ limit: 100 });
        if (result.items.length === 0) {
          console.log("No sessions found.");
          return;
        }

        const sessions = result.items;
        const { search } = await import("@inquirer/prompts");

        const selected = await search({
          message: "Select a session to resume:",
          source: (input) => {
            const term = (input || "").toLowerCase();
            return sessions
              .filter((s) => {
                if (!term) return true;
                const text = formatPickerItem(s).toLowerCase();
                return text.includes(term);
              })
              .map((s) => ({
                name: formatPickerItem(s),
                value: s,
              }));
          },
        });

        if (!selected) return;

        const manager = new TerminalManager(
          opts.terminal as TerminalPreference,
        );
        console.log(
          `Resuming session #${selected.id} (${selected.claude_session_id})...`,
        );
        const { terminal } = await manager.resume(
          selected.claude_session_id,
          selected.project_path ?? undefined,
        );
        console.log(`Opened in ${terminal}`);
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes("User force closed")
        ) {
          // User pressed Ctrl+C
          return;
        }
        console.error(
          err instanceof Error ? err.message : String(err),
        );
        process.exitCode = 1;
      } finally {
        ctx.cleanup();
      }
    });
}
