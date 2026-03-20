import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import {
  SessionIndexFileSchema,
  type SessionIndexEntry,
} from "./schemas.js";
import type { SessionUpsert } from "../repo/types.js";
import {
  discoverJsonlFiles,
  parseJsonlFile,
  type JsonlSessionEntry,
} from "./jsonl-parser.js";

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

interface IndexEnrichment {
  summary: string;
  customTitle: string;
}

/**
 * Build a map of sessionId → {summary, customTitle} from all sessions-index.json files.
 * Used to enrich JSONL-discovered sessions with data only available in the index.
 */
export function buildSummaryMap(
  claudeDataDir: string,
  logger: ParserLogger = nullLogger,
): Map<string, IndexEnrichment> {
  const map = new Map<string, IndexEnrichment>();
  const projectsDir = join(claudeDataDir, "projects");

  if (!existsSync(projectsDir)) {
    return map;
  }

  try {
    const projectDirs = readdirSync(projectsDir, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;

      const indexPath = join(projectsDir, dir.name, "sessions-index.json");
      const entries = parseSessionIndexFile(indexPath, logger);

      for (const entry of entries) {
        if (entry.sessionId && (entry.summary || entry.customTitle)) {
          map.set(entry.sessionId, {
            summary: entry.summary || "",
            customTitle: entry.customTitle || "",
          });
        }
      }
    }
  } catch {
    // Graceful fallback — enrichment is optional
  }

  return map;
}

/**
 * Parse all sessions using JSONL files as primary source, enriched with
 * summary/customTitle from sessions-index.json where available.
 */
export function parseAllSessions(
  claudeDataDir: string,
  logger: ParserLogger = nullLogger,
): JsonlSessionEntry[] {
  const jsonlFiles = discoverJsonlFiles(claudeDataDir, logger);
  const allEntries: JsonlSessionEntry[] = [];

  for (const file of jsonlFiles) {
    const entry = parseJsonlFile(file.path, logger);
    if (entry && entry.messageCount > 0) {
      allEntries.push(entry);
    }
  }

  logger.debug(
    `Discovered ${jsonlFiles.length} JSONL files, parsed ${allEntries.length} sessions`,
  );

  return allEntries;
}

/**
 * Convert a JSONL-parsed session entry into a SessionUpsert for the database.
 * Optionally enriched with summary/customTitle from the sessions-index.json.
 */
export function jsonlEntryToSessionUpsert(
  entry: JsonlSessionEntry,
  enrichment?: IndexEnrichment,
): SessionUpsert {
  const projectPath = entry.cwd || "";
  const repoName = projectPath ? basename(projectPath) : "";

  return {
    claude_session_id: entry.sessionId,
    first_prompt: entry.firstPrompt || null,
    summary: enrichment?.summary || null,
    custom_title: enrichment?.customTitle || null,
    message_count: entry.messageCount,
    is_sidechain: entry.isSidechain,
    project_path: projectPath || null,
    repo_name: repoName || null,
    git_branch: entry.gitBranch || null,
    jsonl_path: entry.jsonlPath || null,
    started_at: entry.startedAt || new Date().toISOString(),
    last_seen_at: entry.lastSeenAt || new Date().toISOString(),
  };
}

/**
 * Convert a SessionIndexEntry (from sessions-index.json) to SessionUpsert.
 * Kept for backward compatibility with existing tests.
 */
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
