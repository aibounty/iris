import type Database from "better-sqlite3";
import {
  discoverJsonlFiles,
  parseJsonlFile,
  buildSummaryMap,
  jsonlEntryToSessionUpsert,
} from "../parser/index.js";
import { SessionRepo } from "../repo/session-repo.js";
import type { ParserLogger } from "../parser/index.js";

export interface ScanResult {
  total: number;
  newSessions: number;
  updated: number;
  skipped: number;
  pruned: number;
  errors: number;
  durationMs: number;
}

export interface IndexerOptions {
  claudeDataDir: string;
  logger?: ParserLogger;
}

export class Indexer {
  private db: Database.Database;
  private repo: SessionRepo;
  private claudeDataDir: string;
  private logger: ParserLogger;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private mtimeCache: Map<string, number> = new Map();

  constructor(db: Database.Database, options: IndexerOptions) {
    this.db = db;
    this.repo = new SessionRepo(db);
    this.claudeDataDir = options.claudeDataDir;
    this.logger = options.logger ?? { warn() {}, debug() {} };
  }

  scan(): ScanResult {
    const start = Date.now();
    let newSessions = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Discover JSONL files
    const jsonlFiles = discoverJsonlFiles(this.claudeDataDir, this.logger);

    // Build enrichment map from sessions-index.json files
    const enrichmentMap = buildSummaryMap(this.claudeDataDir, this.logger);

    // Filter to only changed files (mtime-based)
    const changedFiles = jsonlFiles.filter((f) => {
      const cached = this.mtimeCache.get(f.path);
      if (cached !== undefined && cached === f.mtimeMs) {
        return false;
      }
      return true;
    });

    skipped = jsonlFiles.length - changedFiles.length;
    const total = changedFiles.length;

    const runInTransaction = this.db.transaction(() => {
      for (const file of changedFiles) {
        try {
          const entry = parseJsonlFile(file.path, this.logger);
          if (!entry) {
            // Update mtime cache even for empty/unparseable files to skip next time
            this.mtimeCache.set(file.path, file.mtimeMs);
            continue;
          }

          const enrichment = enrichmentMap.get(entry.sessionId);
          const upsert = jsonlEntryToSessionUpsert(entry, enrichment);
          const existing = this.repo.findByClaudeId(
            upsert.claude_session_id,
          );

          this.repo.upsert(upsert);
          this.mtimeCache.set(file.path, file.mtimeMs);

          if (existing) {
            updated++;
          } else {
            newSessions++;
          }
        } catch (err) {
          errors++;
          this.logger.warn(
            `Failed to index JSONL file ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });

    runInTransaction();

    // Prune empty sessions (messageCount=0) that have no user-added data
    const pruned = this.pruneEmpty();

    const durationMs = Date.now() - start;

    this.logger.debug(
      `Scan complete: ${total} parsed, ${skipped} skipped (unchanged), ${newSessions} new, ${updated} updated, ${pruned} pruned, ${errors} errors in ${durationMs}ms`,
    );

    return { total, newSessions, updated, skipped, pruned, errors, durationMs };
  }

  /**
   * Delete sessions with message_count=0 that have no user-added data
   * (no notes, no pins, no tags). These are empty session scaffolding
   * created by Claude Code but never used.
   */
  private pruneEmpty(): number {
    const result = this.db
      .prepare(
        `
        DELETE FROM sessions
        WHERE message_count = 0
          AND (note IS NULL OR note = '')
          AND pinned = 0
          AND id NOT IN (SELECT session_id FROM session_tags)
        `,
      )
      .run();
    return result.changes;
  }

  /** Reset the mtime cache, forcing a full re-scan on next scan() call. */
  resetCache(): void {
    this.mtimeCache.clear();
  }

  startPolling(intervalMs: number): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      try {
        this.scan();
      } catch (err) {
        this.logger.warn(
          `Poll scan failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  isPolling(): boolean {
    return this.pollInterval !== null;
  }
}
