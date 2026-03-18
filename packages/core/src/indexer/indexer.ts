import type Database from "better-sqlite3";
import { parseAllSessions, toSessionUpsert } from "../parser/index.js";
import { SessionRepo } from "../repo/session-repo.js";
import type { ParserLogger } from "../parser/index.js";

export interface ScanResult {
  total: number;
  newSessions: number;
  updated: number;
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
    let errors = 0;

    const entries = parseAllSessions(this.claudeDataDir, this.logger);
    const total = entries.length;

    const runInTransaction = this.db.transaction(() => {
      for (const entry of entries) {
        try {
          const upsert = toSessionUpsert(entry);
          const existing = this.repo.findByClaudeId(
            upsert.claude_session_id,
          );

          this.repo.upsert(upsert);

          if (existing) {
            updated++;
          } else {
            newSessions++;
          }
        } catch (err) {
          errors++;
          this.logger.warn(
            `Failed to index session ${entry.sessionId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });

    runInTransaction();

    const durationMs = Date.now() - start;

    this.logger.debug(
      `Scan complete: ${total} total, ${newSessions} new, ${updated} updated, ${errors} errors in ${durationMs}ms`,
    );

    return { total, newSessions, updated, errors, durationMs };
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
