import type Database from "better-sqlite3";
import type { Tag } from "./types.js";

export class TagRepo {
  constructor(private db: Database.Database) {}

  listTags(): (Tag & { count: number })[] {
    return this.db
      .prepare(
        `
        SELECT t.*, COUNT(st.session_id) as count
        FROM tags t
        LEFT JOIN session_tags st ON st.tag_id = t.id
        GROUP BY t.id
        ORDER BY count DESC, t.name ASC
      `,
      )
      .all() as (Tag & { count: number })[];
  }

  findByName(name: string): Tag | null {
    return (
      (this.db
        .prepare("SELECT * FROM tags WHERE name = ?")
        .get(name) as Tag | undefined) ?? null
    );
  }
}
