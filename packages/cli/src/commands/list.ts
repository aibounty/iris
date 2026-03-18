import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { formatSessionTable } from "../formatters.js";

export function registerListCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("list")
    .description("List recent sessions")
    .option("--repo <name>", "Filter by repository name")
    .option("--branch <name>", "Filter by git branch")
    .option("--tag <tag>", "Filter by tag")
    .option("--pinned", "Show only pinned sessions")
    .option("--archived", "Include archived sessions")
    .option("--sidechains", "Include sidechain sessions")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const ctx = getCtx();
      try {
        // Quick scan before listing
        ctx.indexer.scan();

        const result = ctx.sessionRepo.list({
          repo: opts.repo,
          branch: opts.branch,
          tag: opts.tag,
          pinned: opts.pinned || undefined,
          archived: opts.archived || undefined,
          sidechains: opts.sidechains || undefined,
          limit: parseInt(opts.limit, 10),
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatSessionTable(result.items));
        }
      } finally {
        ctx.cleanup();
      }
    });
}
