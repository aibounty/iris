import Database from "better-sqlite3";

let instance: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
  if (instance) return instance;

  const path = dbPath ?? getDefaultDbPath();
  instance = new Database(path);

  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.pragma("busy_timeout = 5000");

  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}

export function createDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}

function getDefaultDbPath(): string {
  const home =
    process.env["HOME"] || process.env["USERPROFILE"] || "~";
  return `${home}/.config/iris/data.db`;
}
