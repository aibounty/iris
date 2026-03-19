import type Database from "better-sqlite3";
import type {
  Session,
  SessionWithTags,
  SessionUpsert,
  SessionFilter,
  PaginatedResult,
} from "./types.js";

export class SessionRepo {
  constructor(private db: Database.Database) {}

  upsert(data: SessionUpsert): Session {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        claude_session_id, first_prompt, summary, custom_title,
        message_count, is_sidechain, project_path, repo_name,
        git_branch, jsonl_path, started_at, last_seen_at
      ) VALUES (
        @claude_session_id, @first_prompt, @summary, @custom_title,
        @message_count, @is_sidechain, @project_path, @repo_name,
        @git_branch, @jsonl_path, @started_at, @last_seen_at
      )
      ON CONFLICT(claude_session_id) DO UPDATE SET
        first_prompt  = excluded.first_prompt,
        summary       = excluded.summary,
        custom_title  = excluded.custom_title,
        message_count = excluded.message_count,
        git_branch    = excluded.git_branch,
        last_seen_at  = excluded.last_seen_at,
        jsonl_path    = excluded.jsonl_path,
        updated_at    = datetime('now')
      RETURNING *
    `);

    const session = stmt.get({
      ...data,
      is_sidechain: data.is_sidechain ? 1 : 0,
    }) as Session;

    // Upsert project
    if (data.project_path && data.repo_name) {
      this.db
        .prepare(
          `
        INSERT INTO projects (project_path, repo_name, last_seen_at)
        VALUES (@project_path, @repo_name, @last_seen_at)
        ON CONFLICT(project_path) DO UPDATE SET
          repo_name    = excluded.repo_name,
          last_seen_at = excluded.last_seen_at
      `,
        )
        .run({
          project_path: data.project_path,
          repo_name: data.repo_name,
          last_seen_at: data.last_seen_at,
        });
    }

    return session;
  }

  findById(id: number): SessionWithTags | null {
    const session = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as Session | undefined;
    if (!session) return null;
    return this.attachTags(session);
  }

  findByClaudeId(claudeSessionId: string): SessionWithTags | null {
    const session = this.db
      .prepare("SELECT * FROM sessions WHERE claude_session_id = ?")
      .get(claudeSessionId) as Session | undefined;
    if (!session) return null;
    return this.attachTags(session);
  }

  list(filter: SessionFilter = {}): PaginatedResult<SessionWithTags> {
    const limit = Math.min(filter.limit ?? 50, 200);
    const offset = filter.offset ?? 0;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    // Default: exclude archived unless explicitly requested
    if (!filter.archived) {
      conditions.push("s.status != 'archived'");
    }

    // Default: exclude sidechains unless explicitly requested
    if (!filter.sidechains) {
      conditions.push("s.is_sidechain = 0");
    }

    if (filter.project_path) {
      conditions.push("s.project_path = @project_path");
      params["project_path"] = filter.project_path;
    } else if (filter.repo) {
      conditions.push("s.repo_name = @repo");
      params["repo"] = filter.repo;
    }

    if (filter.branch) {
      conditions.push("s.git_branch = @branch");
      params["branch"] = filter.branch;
    }

    if (filter.pinned) {
      conditions.push("s.pinned = 1");
    }

    let joinClause = "";
    if (filter.tag) {
      joinClause = `
        JOIN session_tags st ON st.session_id = s.id
        JOIN tags t ON t.id = st.tag_id AND t.name = @tag
      `;
      params["tag"] = filter.tag;
    }

    let ftsJoin = "";
    if (filter.q) {
      ftsJoin = `
        JOIN sessions_fts fts ON fts.rowid = s.id
      `;
      conditions.push("sessions_fts MATCH @q");
      params["q"] = filter.q;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortColumn =
      filter.sort === "created"
        ? "s.started_at"
        : filter.sort === "messages"
          ? "s.message_count"
          : "s.last_seen_at";
    const orderClause = `ORDER BY ${sortColumn} DESC`;

    // Count query
    const countSql = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM sessions s ${ftsJoin} ${joinClause}
      ${whereClause}
    `;
    const { total } = this.db.prepare(countSql).get(params) as {
      total: number;
    };

    // Data query
    const dataSql = `
      SELECT DISTINCT s.*
      FROM sessions s ${ftsJoin} ${joinClause}
      ${whereClause}
      ${orderClause}
      LIMIT @limit OFFSET @offset
    `;
    params["limit"] = limit;
    params["offset"] = offset;

    const sessions = this.db.prepare(dataSql).all(params) as Session[];
    const items = sessions.map((s) => this.attachTags(s));

    return { items, total, limit, offset };
  }

  updateNote(id: number, note: string): void {
    const result = this.db
      .prepare(
        "UPDATE sessions SET note = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(note, id);
    if (result.changes === 0) throw new Error(`Session #${id} not found`);
  }

  updatePin(id: number, pinned: boolean): void {
    const result = this.db
      .prepare(
        "UPDATE sessions SET pinned = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(pinned ? 1 : 0, id);
    if (result.changes === 0) throw new Error(`Session #${id} not found`);
  }

  updateArchive(id: number, archived: boolean): void {
    const status = archived ? "archived" : "active";
    const archivedAt = archived ? new Date().toISOString() : null;
    const result = this.db
      .prepare(
        "UPDATE sessions SET status = ?, archived_at = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(status, archivedAt, id);
    if (result.changes === 0) throw new Error(`Session #${id} not found`);
  }

  addTag(sessionId: number, tagName: string): void {
    // Ensure session exists
    const session = this.db
      .prepare("SELECT id FROM sessions WHERE id = ?")
      .get(sessionId);
    if (!session) throw new Error(`Session #${sessionId} not found`);

    // Create tag if not exists
    this.db
      .prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)")
      .run(tagName);
    const tag = this.db
      .prepare("SELECT id FROM tags WHERE name = ?")
      .get(tagName) as { id: number };

    // Link
    this.db
      .prepare(
        "INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?, ?)",
      )
      .run(sessionId, tag.id);
  }

  removeTag(sessionId: number, tagName: string): void {
    const tag = this.db
      .prepare("SELECT id FROM tags WHERE name = ?")
      .get(tagName) as { id: number } | undefined;
    if (!tag) return;

    this.db
      .prepare(
        "DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?",
      )
      .run(sessionId, tag.id);
  }

  getLatestByProjectPath(
    projectPath: string,
  ): SessionWithTags | null {
    const session = this.db
      .prepare(
        "SELECT * FROM sessions WHERE project_path = ? ORDER BY last_seen_at DESC LIMIT 1",
      )
      .get(projectPath) as Session | undefined;
    if (!session) return null;
    return this.attachTags(session);
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  count(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions")
      .get() as { count: number };
    return row.count;
  }

  private attachTags(session: Session): SessionWithTags {
    const tags = this.db
      .prepare(
        `
        SELECT t.name FROM tags t
        JOIN session_tags st ON st.tag_id = t.id
        WHERE st.session_id = ?
        ORDER BY t.name
      `,
      )
      .all(session.id) as { name: string }[];

    return {
      ...session,
      tags: tags.map((t) => t.name),
    };
  }
}
