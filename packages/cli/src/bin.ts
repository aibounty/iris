#!/usr/bin/env node
import { Command } from "commander";
import { getContext } from "./context.js";
import type { CliContext } from "./context.js";
import { registerListCommand } from "./commands/list.js";
import { registerShowCommand } from "./commands/show.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerScanCommand } from "./commands/scan.js";
import { registerNoteCommand } from "./commands/note.js";
import { registerTagCommand } from "./commands/tag.js";
import { registerPinCommand } from "./commands/pin.js";
import { registerArchiveCommand } from "./commands/archive.js";

export function createProgram(
  contextFactory?: () => CliContext,
): Command {
  const program = new Command();

  program
    .name("iris")
    .description("Terminal-first session manager for Claude Code")
    .version("0.1.0");

  const getCtx = contextFactory ?? (() => getContext());

  registerListCommand(program, getCtx);
  registerShowCommand(program, getCtx);
  registerSearchCommand(program, getCtx);
  registerScanCommand(program, getCtx);
  registerNoteCommand(program, getCtx);
  registerTagCommand(program, getCtx);
  registerPinCommand(program, getCtx);
  registerArchiveCommand(program, getCtx);

  return program;
}

// Only run when executed directly
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("/bin.js") ||
    process.argv[1].endsWith("/bin.ts"));

if (isDirectRun) {
  const program = createProgram();
  program.parse();
}
