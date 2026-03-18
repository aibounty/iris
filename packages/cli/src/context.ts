import {
  createDb,
  runMigrations,
  SessionRepo,
  ProjectRepo,
  TagRepo,
  Indexer,
} from "@iris/core";
import type Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface CliContext {
  db: Database.Database;
  sessionRepo: SessionRepo;
  projectRepo: ProjectRepo;
  tagRepo: TagRepo;
  indexer: Indexer;
  cleanup: () => void;
}

export function getContext(options?: {
  dbPath?: string;
  claudeDataDir?: string;
}): CliContext {
  const home =
    process.env["HOME"] || process.env["USERPROFILE"] || "~";
  const dbPath = options?.dbPath ?? `${home}/.config/iris/data.db`;
  const claudeDataDir = options?.claudeDataDir ?? `${home}/.claude`;

  // Ensure directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = createDb(dbPath);
  runMigrations(db);

  const sessionRepo = new SessionRepo(db);
  const projectRepo = new ProjectRepo(db);
  const tagRepo = new TagRepo(db);
  const indexer = new Indexer(db, { claudeDataDir });

  return {
    db,
    sessionRepo,
    projectRepo,
    tagRepo,
    indexer,
    cleanup() {
      indexer.stopPolling();
      db.close();
    },
  };
}
