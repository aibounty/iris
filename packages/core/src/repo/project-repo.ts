import type Database from "better-sqlite3";
import type { Project } from "./types.js";

export class ProjectRepo {
  constructor(private db: Database.Database) {}

  listProjects(): (Project & { session_count: number })[] {
    return this.db
      .prepare(
        `
        SELECT p.*, COUNT(s.id) as session_count
        FROM projects p
        LEFT JOIN sessions s ON s.project_path = p.project_path
        GROUP BY p.id
        ORDER BY p.last_seen_at DESC
      `,
      )
      .all() as (Project & { session_count: number })[];
  }

  findByPath(path: string): Project | null {
    return (
      (this.db
        .prepare("SELECT * FROM projects WHERE project_path = ?")
        .get(path) as Project | undefined) ?? null
    );
  }
}
