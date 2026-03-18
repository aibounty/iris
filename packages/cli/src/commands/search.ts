import type { Command } from "commander";
import type { CliContext } from "../context.js";
import { formatSessionTable } from "../formatters.js";

export function registerSearchCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  program
    .command("search <query>")
    .description("Search sessions")
    .option("--repo <name>", "Filter by repository name")
    .option("--branch <name>", "Filter by git branch")
    .option("--tag <tag>", "Filter by tag")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action((query, opts) => {
      const ctx = getCtx();
      try {
        // Scan before searching
        ctx.indexer.scan();

        const result = ctx.sessionRepo.list({
          q: query,
          repo: opts.repo,
          branch: opts.branch,
          tag: opts.tag,
          limit: parseInt(opts.limit, 10),
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.items.length === 0) {
          console.log(`No sessions found for "${query}"`);
        } else {
          console.log(formatSessionTable(result.items));
        }
      } finally {
        ctx.cleanup();
      }
    });
}
