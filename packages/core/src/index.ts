export { getDb, closeDb, createDb, runMigrations } from "./db/index.js";
export {
  SessionRepo,
  ProjectRepo,
  TagRepo,
} from "./repo/index.js";
export type {
  Session,
  SessionWithTags,
  Tag,
  Project,
  SessionEvent,
  SessionFilter,
  SessionUpsert,
  PaginatedResult,
} from "./repo/index.js";
export {
  parseSessionIndexFile,
  discoverProjectDirs,
  parseAllSessions,
  toSessionUpsert,
} from "./parser/index.js";
export type {
  ParserLogger,
  SessionIndexEntry,
  SessionIndexFile,
} from "./parser/index.js";
export { Indexer } from "./indexer/index.js";
export type { ScanResult, IndexerOptions } from "./indexer/index.js";
export { TerminalManager, ShellAdapter } from "./terminal/index.js";
export type { TerminalAdapter, TerminalPreference } from "./terminal/index.js";
