import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import type { ParserLogger } from "./claude-data-parser.js";

const nullLogger: ParserLogger = {
  warn() {},
  debug() {},
};

export interface JsonlSessionEntry {
  sessionId: string;
  cwd: string;
  gitBranch: string;
  isSidechain: boolean;
  firstPrompt: string;
  messageCount: number;
  startedAt: string;
  lastSeenAt: string;
  jsonlPath: string;
  fileMtimeMs: number;
}

export interface JsonlFileInfo {
  path: string;
  mtimeMs: number;
}

/**
 * Discover all non-agent JSONL session files under claudeDataDir/projects.
 */
export function discoverJsonlFiles(
  claudeDataDir: string,
  logger: ParserLogger = nullLogger,
): JsonlFileInfo[] {
  const projectsDir = join(claudeDataDir, "projects");

  if (!existsSync(projectsDir)) {
    return [];
  }

  const results: JsonlFileInfo[] = [];

  try {
    const projectDirs = readdirSync(projectsDir, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;

      const dirPath = join(projectsDir, dir.name);

      try {
        const files = readdirSync(dirPath, { withFileTypes: true });

        for (const file of files) {
          if (!file.isFile()) continue;
          if (!file.name.endsWith(".jsonl")) continue;
          if (file.name.startsWith("agent-")) continue;

          const filePath = join(dirPath, file.name);
          try {
            const stat = statSync(filePath);
            results.push({ path: filePath, mtimeMs: stat.mtimeMs });
          } catch {
            // Skip files we can't stat
          }
        }
      } catch {
        logger.debug(`Failed to read project directory: ${dirPath}`);
      }
    }
  } catch {
    logger.warn(`Failed to read projects directory: ${projectsDir}`);
  }

  return results;
}

/**
 * Parse a single JSONL file and extract session metadata in a single pass.
 * Returns null if the file is empty or cannot be parsed.
 */
export function parseJsonlFile(
  filePath: string,
  logger: ParserLogger = nullLogger,
): JsonlSessionEntry | null {
  let content: string;
  let mtimeMs: number;

  try {
    const stat = statSync(filePath);
    mtimeMs = stat.mtimeMs;
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    logger.debug(
      `Failed to read JSONL file: ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  if (!content.trim()) {
    return null;
  }

  let sessionId = "";
  let cwd = "";
  let gitBranch = "";
  let isSidechain = false;
  let firstPrompt = "";
  let messageCount = 0;
  let firstTimestamp = "";
  let lastTimestamp = "";
  let metadataFound = false;

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue; // Skip malformed lines
    }

    const type = parsed.type as string | undefined;
    const timestamp = parsed.timestamp as string | undefined;

    // Extract metadata from first user or assistant message
    if (!metadataFound && (type === "user" || type === "assistant")) {
      if (parsed.sessionId) sessionId = String(parsed.sessionId);
      if (parsed.cwd) cwd = String(parsed.cwd);
      if (parsed.gitBranch) gitBranch = String(parsed.gitBranch);
      if (typeof parsed.isSidechain === "boolean")
        isSidechain = parsed.isSidechain;
      metadataFound = true;
    }

    // Extract first user prompt
    if (!firstPrompt && type === "user") {
      const message = parsed.message as
        | { content?: unknown; role?: string }
        | undefined;
      if (message?.content) {
        if (typeof message.content === "string") {
          firstPrompt = message.content;
        } else if (Array.isArray(message.content)) {
          // Content might be an array of content blocks
          for (const block of message.content) {
            if (
              typeof block === "object" &&
              block !== null &&
              "type" in block &&
              (block as Record<string, unknown>).type === "text" &&
              "text" in block
            ) {
              firstPrompt = String(
                (block as Record<string, unknown>).text,
              );
              break;
            }
          }
        }
      }
    }

    // Track timestamps
    if (timestamp) {
      if (!firstTimestamp) firstTimestamp = timestamp;
      lastTimestamp = timestamp;
    }

    // Count user and assistant messages
    if (type === "user") {
      messageCount++;
    } else if (type === "assistant") {
      // Assistant messages come in streaming chunks sharing the same requestId.
      // Only count unique requestIds to avoid inflating the count.
      // For simplicity, count all assistant lines — the index file does the same.
      messageCount++;
    }
  }

  // If we couldn't extract a sessionId, derive it from the filename
  if (!sessionId) {
    const filename = basename(filePath, ".jsonl");
    // Only use filename as sessionId if it looks like a UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filename)) {
      sessionId = filename;
    } else {
      logger.debug(`Could not determine sessionId for: ${filePath}`);
      return null;
    }
  }

  return {
    sessionId,
    cwd,
    gitBranch,
    isSidechain,
    firstPrompt,
    messageCount,
    startedAt: firstTimestamp || new Date().toISOString(),
    lastSeenAt: lastTimestamp || new Date().toISOString(),
    jsonlPath: filePath,
    fileMtimeMs: mtimeMs,
  };
}
