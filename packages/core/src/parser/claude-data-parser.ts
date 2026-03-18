import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import {
  SessionIndexFileSchema,
  type SessionIndexEntry,
} from "./schemas.js";
import type { SessionUpsert } from "../repo/types.js";

export interface ParserLogger {
  warn(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

const nullLogger: ParserLogger = {
  warn() {},
  debug() {},
};

export function parseSessionIndexFile(
  filePath: string,
  logger: ParserLogger = nullLogger,
): SessionIndexEntry[] {
  try {
    if (!existsSync(filePath)) {
      logger.debug(`Session index file not found: ${filePath}`);
      return [];
    }

    const raw = readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);
    const parsed = SessionIndexFileSchema.safeParse(json);

    if (!parsed.success) {
      logger.warn(
        `Failed to parse session index: ${filePath}: ${parsed.error.message}`,
      );
      return [];
    }

    return parsed.data.entries;
  } catch (err) {
    logger.warn(
      `Error reading session index: ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

export function discoverProjectDirs(claudeDataDir: string): string[] {
  const projectsDir = join(claudeDataDir, "projects");

  if (!existsSync(projectsDir)) {
    return [];
  }

  try {
    const entries = readdirSync(projectsDir, { withFileTypes: true });
    const dirs: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirPath = join(projectsDir, entry.name);
      const indexPath = join(dirPath, "sessions-index.json");

      if (existsSync(indexPath)) {
        dirs.push(dirPath);
      }
    }

    return dirs;
  } catch {
    return [];
  }
}

export function parseAllSessions(
  claudeDataDir: string,
  logger: ParserLogger = nullLogger,
): SessionIndexEntry[] {
  const dirs = discoverProjectDirs(claudeDataDir);
  const allEntries: SessionIndexEntry[] = [];

  for (const dir of dirs) {
    const indexPath = join(dir, "sessions-index.json");
    const entries = parseSessionIndexFile(indexPath, logger);
    allEntries.push(...entries);
  }

  return allEntries;
}

export function toSessionUpsert(entry: SessionIndexEntry): SessionUpsert {
  const projectPath = entry.projectPath || "";
  const repoName = projectPath ? basename(projectPath) : "";

  return {
    claude_session_id: entry.sessionId,
    first_prompt: entry.firstPrompt || null,
    summary: entry.summary || null,
    custom_title: entry.customTitle || null,
    message_count: entry.messageCount,
    is_sidechain: entry.isSidechain,
    project_path: projectPath || null,
    repo_name: repoName || null,
    git_branch: entry.gitBranch || null,
    jsonl_path: entry.fullPath || null,
    started_at: entry.created || new Date().toISOString(),
    last_seen_at: entry.modified || new Date().toISOString(),
  };
}
