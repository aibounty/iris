# Iris — Implementation Prompts

## Build Blueprint

This document contains a series of prompts for a code-generation LLM to build Iris incrementally. Each prompt builds on the previous one. The implementation follows test-driven development: tests are written alongside code, and nothing is left unwired.

### Architecture Layers (build order)

```
1. Project scaffolding + tooling
2. Database layer (schema, migrations, repository)
3. Claude Code data parser (read sessions-index.json)
4. Indexer (scan + upsert into DB)
5. CLI foundation (list, show, search)
6. CLI mutations (note, tag, pin, archive)
7. CLI resume + terminal adapters
8. CLI interactive picker + current session
9. Web API server (read endpoints)
10. Web API mutations + auth
11. Web UI scaffolding + dashboard
12. Web UI session detail + mutations
13. Web UI project view + filters
14. Serve command (wires API + UI + indexer)
15. Configuration + logging
16. Polish + integration tests
```

---

## Prompt 1: Project Scaffolding

```text
I'm building a TypeScript project called "iris" — a local session manager for Claude Code.
The project root is at /Volumes/PavelData/ai/iris.

Set up the project scaffolding with the following structure:

packages/
  core/          — shared database, models, indexer logic
  cli/           — Commander.js CLI binary
  server/        — Fastify HTTP API server
  web/           — React + Vite frontend

Use a monorepo approach with npm workspaces. The root package.json should define
workspaces for all four packages.

For each package, create:
- package.json with appropriate name (@iris/core, @iris/cli, @iris/server, @iris/web)
- tsconfig.json extending a root tsconfig.base.json

Root-level setup:
- tsconfig.base.json with strict mode, ES2022 target, NodeNext module resolution
- Root package.json with workspaces and shared dev dependencies
- vitest as the test runner (root vitest.config.ts with workspace support)
- A single shared vitest workspace config

Specific package details:

@iris/core:
- Dependencies: better-sqlite3, smol-toml, pino, zod
- Dev dependencies: @types/better-sqlite3
- Has its own vitest config
- Exports from src/index.ts

@iris/cli:
- Dependencies: commander, @iris/core, chalk, cli-table3
- bin entry: "iris" pointing to dist/bin.js
- Has its own vitest config

@iris/server:
- Dependencies: fastify, @fastify/cors, @iris/core
- Has its own vitest config

@iris/web:
- Standard Vite + React + TypeScript setup
- Dependencies: react, react-dom, @tanstack/react-query, @tanstack/react-router
- Dev dependencies: @vitejs/plugin-react, tailwindcss, postcss, autoprefixer
- Configure Tailwind CSS
- Vite config with proxy to http://127.0.0.1:4269/api for dev mode

Create a minimal src/index.ts in each package that exports an empty object or placeholder.

Write a test in @iris/core (src/__tests__/setup.test.ts) that simply asserts true === true
to verify the test infrastructure works.

Make sure `npm run build` works across all packages (use tsc for core/cli/server).
Add these root scripts:
- "build": builds all packages
- "test": runs vitest
- "dev:web": runs Vite dev server for @iris/web
- "dev:server": runs the server with tsx watch

Do NOT install shadcn/ui yet — just set up Tailwind. We'll add components later.
Do NOT create any real application logic yet.
```

---

## Prompt 2: Database Schema and Migrations

```text
We're building the database layer for Iris in the @iris/core package.

Context: Iris stores Claude Code session metadata in a local SQLite database
at ~/.config/iris/data.db. The database uses WAL mode for concurrent access.

Create the following in packages/core/src/db/:

1. db.ts — Database connection manager
   - Function getDb(dbPath?: string) that opens/returns a singleton better-sqlite3 connection
   - Defaults to ~/.config/iris/data.db
   - Enables WAL mode on first open
   - Enables foreign keys
   - Has a closeDb() for cleanup
   - Accept an optional ":memory:" path for testing

2. migrate.ts — Migration system
   - Migrations are numbered functions: migration_001, migration_002, etc.
   - Track applied migrations in a schema_version table
   - runMigrations(db) applies all pending migrations in order
   - Migrations are idempotent (use IF NOT EXISTS)

3. Migration 001 — Initial schema (in migrate.ts):

   sessions table:
   - id INTEGER PRIMARY KEY AUTOINCREMENT
   - claude_session_id TEXT UNIQUE NOT NULL
   - first_prompt TEXT
   - summary TEXT
   - custom_title TEXT
   - note TEXT
   - message_count INTEGER NOT NULL DEFAULT 0
   - is_sidechain INTEGER NOT NULL DEFAULT 0
   - status TEXT NOT NULL DEFAULT 'active'
   - pinned INTEGER NOT NULL DEFAULT 0
   - project_path TEXT
   - repo_name TEXT
   - git_branch TEXT
   - jsonl_path TEXT
   - started_at TEXT NOT NULL (ISO 8601)
   - last_seen_at TEXT NOT NULL (ISO 8601)
   - archived_at TEXT
   - source TEXT NOT NULL DEFAULT 'passive'
   - created_at TEXT NOT NULL DEFAULT (datetime('now'))
   - updated_at TEXT NOT NULL DEFAULT (datetime('now'))

   tags table:
   - id INTEGER PRIMARY KEY AUTOINCREMENT
   - name TEXT UNIQUE NOT NULL

   session_tags table:
   - session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
   - tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE
   - UNIQUE(session_id, tag_id)

   session_events table:
   - id INTEGER PRIMARY KEY AUTOINCREMENT
   - session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
   - event_type TEXT NOT NULL
   - payload_json TEXT
   - created_at TEXT NOT NULL DEFAULT (datetime('now'))

   projects table:
   - id INTEGER PRIMARY KEY AUTOINCREMENT
   - project_path TEXT UNIQUE NOT NULL
   - repo_name TEXT NOT NULL
   - last_seen_at TEXT NOT NULL

   config table:
   - key TEXT PRIMARY KEY
   - value TEXT NOT NULL

   Indexes:
   - idx_sessions_last_seen ON sessions(last_seen_at DESC)
   - idx_sessions_repo ON sessions(repo_name)
   - idx_sessions_branch ON sessions(git_branch)
   - idx_sessions_status ON sessions(status)
   - idx_sessions_pinned ON sessions(pinned, last_seen_at DESC)
   - idx_sessions_project_path ON sessions(project_path)
   - idx_session_events_session ON session_events(session_id, created_at DESC)

   FTS5 virtual table:
   - sessions_fts using fts5(first_prompt, summary, custom_title, note, repo_name, git_branch, content=sessions, content_rowid=id)
   - Triggers to keep FTS in sync on INSERT, UPDATE, DELETE of sessions

4. Export getDb, closeDb, runMigrations from @iris/core index.

Tests (packages/core/src/__tests__/db.test.ts):
- Test that getDb(":memory:") returns a working database
- Test that runMigrations creates all tables (query sqlite_master)
- Test that runMigrations is idempotent (run twice, no error)
- Test that WAL mode is enabled
- Test that foreign keys are enabled

All tests use in-memory databases — no file I/O.
```

---

## Prompt 3: Session Repository (CRUD)

```text
Build the session repository layer for Iris in @iris/core.

Context: The database schema from the previous step is in packages/core/src/db/.
We need a repository layer that provides typed CRUD operations for sessions, tags,
and projects.

Create the following in packages/core/src/repo/:

1. types.ts — Shared TypeScript types
   - Session interface matching the sessions table columns
   - SessionWithTags interface (Session + tags: string[])
   - Tag interface
   - Project interface
   - SessionEvent interface
   - SessionFilter interface: { q?: string, repo?: string, branch?: string,
     tag?: string, pinned?: boolean, archived?: boolean, sidechains?: boolean,
     limit?: number, offset?: number, sort?: 'modified' | 'created' | 'messages' }
   - SessionUpsert interface (what the indexer provides — the fields from Claude Code data)
   - PaginatedResult<T> interface: { items: T[], total: number, limit: number, offset: number }

2. session-repo.ts — Session repository
   - constructor takes a better-sqlite3 Database instance
   - upsert(data: SessionUpsert): Session
     — INSERT OR UPDATE by claude_session_id
     — On conflict, update: first_prompt, summary, custom_title, message_count,
       git_branch, last_seen_at, jsonl_path (but NEVER overwrite user-provided
       fields: note, tags, pinned, archived)
     — Also upsert into the projects table
     — Trigger FTS sync
   - findById(id: number): SessionWithTags | null
   - findByClaudeId(claudeSessionId: string): SessionWithTags | null
   - list(filter: SessionFilter): PaginatedResult<SessionWithTags>
     — Build WHERE clause from filter
     — If q is provided, use FTS5 search
     — If tag is provided, JOIN through session_tags
     — Apply sort, limit, offset
     — Return total count alongside results
   - updateNote(id: number, note: string): void
   - updatePin(id: number, pinned: boolean): void
   - updateArchive(id: number, archived: boolean): void
   - addTag(sessionId: number, tagName: string): void
     — Create tag if it doesn't exist, then link
   - removeTag(sessionId: number, tagName: string): void
   - getLatestByProjectPath(projectPath: string): SessionWithTags | null
   - delete(id: number): void

3. project-repo.ts — Project repository
   - listProjects(): (Project & { session_count: number })[]
   - findByPath(path: string): Project | null

4. tag-repo.ts — Tag repository
   - listTags(): (Tag & { count: number })[]
   - findByName(name: string): Tag | null

5. Export all from @iris/core index.

Tests (packages/core/src/__tests__/session-repo.test.ts):
- Create an in-memory DB, run migrations
- Test upsert: insert new session, verify all fields
- Test upsert: update existing session (same claude_session_id), verify
  user fields (note, pinned) are preserved
- Test list with no filters returns sessions ordered by last_seen_at desc
- Test list with repo filter
- Test list with pinned filter
- Test list with FTS search (q parameter) — insert sessions with different
  summaries, search for a keyword, verify correct results
- Test list with tag filter
- Test list with limit/offset pagination and total count
- Test updateNote, then findById confirms the note
- Test addTag/removeTag, verify through findById tags array
- Test updatePin/updateArchive
- Test getLatestByProjectPath
- Test that projects table is populated after session upserts

Tests (packages/core/src/__tests__/project-repo.test.ts):
- Test listProjects returns projects with session counts
- Test findByPath

Tests (packages/core/src/__tests__/tag-repo.test.ts):
- Test listTags returns tags with counts
- Test that unused tags still exist after removeTag (don't auto-delete)
```

---

## Prompt 4: Claude Code Data Parser

```text
Build the Claude Code data parser for Iris in @iris/core.

Context: Claude Code stores session data at ~/.claude/projects/. Each project
directory is named with an encoded path (slashes replaced with hyphens, e.g.,
/Volumes/PavelData/ai/myproject → -Volumes-PavelData-ai-myproject). Each project
directory contains a sessions-index.json file.

The sessions-index.json format:
{
  "version": 1,
  "entries": [
    {
      "sessionId": "738269ac-54a4-41dd-8531-bbde1d665987",
      "fullPath": "/Users/user/.claude/projects/-path/session.jsonl",
      "fileMtime": 1742000000000,
      "firstPrompt": "Fix the authentication bug",
      "summary": "Debugged auth token refresh logic...",
      "messageCount": 42,
      "created": "2025-03-15T10:00:00.000Z",
      "modified": "2025-03-15T12:30:00.000Z",
      "gitBranch": "feature/auth-fix",
      "projectPath": "/Volumes/PavelData/ai/myproject",
      "isSidechain": false,
      "customTitle": "Auth fix session"
    }
  ],
  "originalPath": "/Volumes/PavelData/ai/myproject"
}

Create packages/core/src/parser/:

1. schemas.ts — Zod schemas for validation
   - SessionIndexEntry schema (all fields from above, with sensible defaults
     for optional fields — summary, customTitle, gitBranch can be empty string)
   - SessionIndexFile schema (version, entries array, originalPath)
   - Make the parser lenient: unknown fields are stripped, not rejected.
     This is critical for forward-compatibility with future Claude Code versions.

2. claude-data-parser.ts — Parser functions
   - parseSessionIndexFile(filePath: string): SessionIndexEntry[]
     — Reads the file, parses JSON, validates with Zod
     — Returns validated entries
     — On any error (file not found, invalid JSON, schema mismatch),
       returns empty array and logs a warning (accept a logger parameter)
   - discoverProjectDirs(claudeDataDir: string): string[]
     — Scans ~/.claude/projects/ for directories
     — Returns absolute paths to directories that contain sessions-index.json
   - parseAllSessions(claudeDataDir: string): SessionIndexEntry[]
     — Calls discoverProjectDirs, then parseSessionIndexFile for each
     — Aggregates and returns all entries
   - toSessionUpsert(entry: SessionIndexEntry): SessionUpsert
     — Maps a SessionIndexEntry to the SessionUpsert type from repo/types.ts
     — Derives repo_name from projectPath (last path segment)
     — Maps field names (camelCase → snake_case equivalents)

3. Export from @iris/core index.

Tests (packages/core/src/__tests__/claude-data-parser.test.ts):
- Use a temporary directory (create in beforeEach, clean in afterEach)
- Create mock sessions-index.json files in the temp dir structure
- Test parseSessionIndexFile with valid data
- Test parseSessionIndexFile with missing file (returns [])
- Test parseSessionIndexFile with invalid JSON (returns [])
- Test parseSessionIndexFile with extra unknown fields (succeeds, strips them)
- Test parseSessionIndexFile with missing optional fields (defaults applied)
- Test discoverProjectDirs finds all project directories
- Test discoverProjectDirs skips directories without sessions-index.json
- Test parseAllSessions aggregates from multiple projects
- Test toSessionUpsert maps fields correctly, including repo_name derivation
```

---

## Prompt 5: Indexer

```text
Build the session indexer for Iris in @iris/core.

Context: We have a Claude Code data parser (packages/core/src/parser/) that reads
sessions-index.json files, and a session repository (packages/core/src/repo/) that
stores data in SQLite. The indexer connects these two: it scans Claude Code data
and upserts sessions into the database.

Create packages/core/src/indexer/:

1. indexer.ts — Main indexer class

   class Indexer:
   - constructor(db: Database, options: { claudeDataDir: string, logger: Logger })
   - scan(): ScanResult
     — Calls parseAllSessions to get all Claude Code session entries
     — For each entry, calls toSessionUpsert then repo.upsert
     — Tracks counts: { total: number, new: number, updated: number, errors: number }
     — Returns ScanResult with counts and duration
     — Wraps the entire operation in a transaction for atomicity
   - startPolling(intervalMs: number): void
     — Sets up setInterval to call scan() periodically
     — Stores the interval handle
   - stopPolling(): void
     — Clears the interval
   - isPolling(): boolean

   interface ScanResult:
   - total: number (entries found in Claude Code data)
   - new: number (newly inserted)
   - updated: number (existing sessions updated)
   - errors: number (entries that failed to upsert)
   - durationMs: number

2. Export Indexer and ScanResult from @iris/core index.

Tests (packages/core/src/__tests__/indexer.test.ts):
- Set up: create temp dir with mock Claude Code data, create in-memory DB with migrations
- Test scan() with fresh database: all sessions are new
- Test scan() with existing data: sessions are updated, counts reflect this
- Test scan() with partially invalid data: valid sessions still indexed, errors counted
- Test scan() is transactional: if something fails mid-scan, no partial state
- Test startPolling/stopPolling lifecycle
- Test scan() result includes correct counts and duration

After writing the indexer, verify that the full pipeline works end-to-end:
  mock Claude data → parser → indexer → verify in DB via repo

This is a critical integration point. Write one integration test that:
1. Creates a temp dir mimicking ~/.claude/projects/ with 2 projects, 5 sessions total
2. Creates in-memory DB, runs migrations
3. Runs indexer.scan()
4. Queries sessions via SessionRepo.list() and verifies all 5 are present
5. Adds a note to one session via SessionRepo.updateNote()
6. Runs indexer.scan() again
7. Verifies the note is preserved (not overwritten by re-index)
```

---

## Prompt 6: CLI Foundation — list, show, search, scan

```text
Build the CLI foundation for Iris in the @iris/cli package.

Context: @iris/core provides getDb, runMigrations, SessionRepo, Indexer, and all types.
The CLI binary is called "iris" and uses Commander.js.

Create the following:

1. packages/cli/src/bin.ts — Entry point
   - #!/usr/bin/env node
   - Creates the Commander program with name "iris", version "0.1.0"
   - Registers all command modules
   - Calls program.parse()

2. packages/cli/src/context.ts — Shared CLI context
   - Function getContext(options?: { dbPath?: string }): { db, sessionRepo, projectRepo, tagRepo, indexer }
   - Opens the DB (default path ~/.config/iris/data.db), runs migrations
   - Creates repo instances and indexer
   - Has a cleanup() function that closes the DB
   - The indexer uses the default Claude data dir (~/.claude) unless overridden

3. packages/cli/src/formatters.ts — Output formatting
   - formatSessionTable(sessions: SessionWithTags[]): string
     — Uses cli-table3 to render a compact table
     — Columns: ID, Title (truncated to 40 chars, prefer customTitle > firstPrompt),
       Repo, Branch, Modified (relative time like "2h ago"), Pinned (★ or empty)
   - formatSessionDetail(session: SessionWithTags): string
     — Full detail view with all fields, nicely formatted
   - formatProjectTable(projects): string
   - toRelativeTime(isoDate: string): string — "2h ago", "3d ago", etc.

4. packages/cli/src/commands/list.ts
   - Command: iris list [options]
   - Options: --repo, --branch, --tag, --pinned, --archived, --sidechains, --limit (default 20), --json
   - Triggers a scan first (quick, from index files)
   - Queries SessionRepo.list with filters
   - Outputs table or JSON

5. packages/cli/src/commands/show.ts
   - Command: iris show <id>
   - Looks up by internal ID (number) or claude_session_id (UUID string)
   - Outputs formatted detail view or JSON (--json)

6. packages/cli/src/commands/search.ts
   - Command: iris search <query> [options]
   - Options: --repo, --branch, --tag, --limit (default 20), --json
   - Uses SessionRepo.list with the q parameter for FTS search
   - Outputs table or JSON

7. packages/cli/src/commands/scan.ts
   - Command: iris scan
   - Runs indexer.scan()
   - Prints result: "Scanned X sessions (Y new, Z updated) in Nms"

Wire all commands into bin.ts. Export the program for testing.

Tests (packages/cli/src/__tests__/commands.test.ts):
- Use in-memory DB, seed with test data via SessionRepo.upsert
- Test list command outputs expected number of sessions
- Test list --repo filters correctly
- Test list --json produces valid JSON
- Test show <id> outputs session details
- Test show with non-existent ID exits with code 2
- Test search finds sessions by keyword
- Test search with no results shows appropriate message

For testing, create a helper that captures stdout/stderr from command execution
rather than actually spawning processes. Use Commander's parseAsync with
custom output streams or test the underlying handler functions directly.
```

---

## Prompt 7: CLI Mutations — note, tag, pin, archive

```text
Add mutation commands to the Iris CLI.

Context: The CLI foundation (list, show, search, scan) is built in @iris/cli.
SessionRepo in @iris/core provides updateNote, updatePin, updateArchive, addTag,
removeTag methods.

Create the following commands:

1. packages/cli/src/commands/note.ts
   - Command: iris note <id> <text>
   - Accepts internal ID (number) or "current" (handled later in a separate prompt)
   - For now, only numeric IDs
   - Calls sessionRepo.updateNote(id, text)
   - Prints confirmation: "Note saved for session #<id>"
   - If session not found, error exit code 2

2. packages/cli/src/commands/tag.ts
   - Subcommands:
     - iris tag add <id> <tag>
     - iris tag remove <id> <tag>
   - Calls sessionRepo.addTag / removeTag
   - Prints confirmation
   - If session not found, error exit code 2

3. packages/cli/src/commands/pin.ts
   - Command: iris pin <id>
   - Calls sessionRepo.updatePin(id, true)
   - Prints: "Session #<id> pinned"

4. packages/cli/src/commands/unpin.ts
   - Command: iris unpin <id>
   - Calls sessionRepo.updatePin(id, false)
   - Prints: "Session #<id> unpinned"

5. packages/cli/src/commands/archive.ts
   - Command: iris archive <id>
   - Calls sessionRepo.updateArchive(id, true)
   - Prints: "Session #<id> archived"

6. packages/cli/src/commands/unarchive.ts
   - Command: iris unarchive <id>
   - Calls sessionRepo.updateArchive(id, false)
   - Prints: "Session #<id> unarchived"

Wire all commands into bin.ts.

Create a shared helper packages/cli/src/resolve-session.ts:
- resolveSession(repo: SessionRepo, idOrUuid: string): SessionWithTags
  — If idOrUuid is a number, look up by internal ID
  — If idOrUuid looks like a UUID, look up by claude_session_id
  — Throws a user-friendly error if not found

Use this helper in show, note, tag, pin, unpin, archive, unarchive commands.

Tests (packages/cli/src/__tests__/mutations.test.ts):
- Seed in-memory DB with test sessions
- Test note command saves note, verify via show
- Test tag add, verify via show
- Test tag remove, verify via show
- Test pin/unpin toggle
- Test archive/unarchive toggle
- Test with non-existent session ID returns error
- Test resolveSession with numeric ID
- Test resolveSession with UUID string
```

---

## Prompt 8: CLI Resume + Terminal Adapters

```text
Add resume functionality and terminal adapters to Iris.

Context: The CLI has list, show, search, note, tag, pin, archive commands.
Resume needs to open a terminal and run `claude --resume <session_id>`.

Create the following:

1. packages/core/src/terminal/:

   terminal-adapter.ts — Terminal adapter interface and implementations

   interface TerminalAdapter:
   - name: string
   - isAvailable(): Promise<boolean>
   - openSession(claudeSessionId: string, projectPath?: string): Promise<void>

   Implementations:

   a) ShellAdapter — Fallback, spawns claude directly in current shell
      - Uses execa to run: claude --resume <session_id>
      - If projectPath provided, sets cwd
      - Inherits stdio

   b) ItermAdapter — Opens a new iTerm2 tab via AppleScript
      - isAvailable: check if iTerm is running (via `osascript -e 'application "iTerm" is running'`)
      - openSession: runs AppleScript that creates new tab, cd's to projectPath,
        then runs `claude --resume <session_id>`
      - Use execa to run osascript

   c) TerminalAppAdapter — Opens a new Terminal.app tab via AppleScript
      - Similar to iTerm but targets Terminal.app

   d) KittyAdapter — Opens via kitty remote control
      - isAvailable: check if kitty socket exists
      - openSession: uses `kitty @ launch --type=tab ...`

   terminal-manager.ts — Selects and uses the right adapter

   class TerminalManager:
   - constructor(preferred: 'auto' | 'iterm' | 'terminal_app' | 'kitty' | 'shell')
   - resolve(): Promise<TerminalAdapter>
     — If preferred is 'auto', try iTerm → Terminal.app → kitty → shell
     — Otherwise use the specified one, fall back to shell if unavailable
   - resume(claudeSessionId: string, projectPath?: string): Promise<{ terminal: string }>
     — Resolves adapter, calls openSession, returns which terminal was used

2. packages/cli/src/commands/open.ts
   - Command: iris open <id>
   - Options: --terminal <type> (default: auto)
   - Resolves session by ID, gets claude_session_id
   - Uses TerminalManager to resume
   - Prints: "Resuming session in <terminal>..."

3. packages/cli/src/commands/resume.ts
   - Command: iris resume <claude_session_id>
   - Options: --terminal <type>
   - Validates the UUID format
   - Uses TerminalManager to resume directly
   - Prints: "Resuming session in <terminal>..."

4. packages/cli/src/commands/last.ts
   - Command: iris last
   - Options: --terminal <type>
   - Gets the most recently modified session from the DB
   - Uses TerminalManager to resume
   - Prints session info + "Resuming in <terminal>..."

Wire all commands into bin.ts.
Export TerminalManager from @iris/core.

Tests:
For terminal adapters, mock execa since we can't actually open terminals in tests.

packages/core/src/__tests__/terminal-adapter.test.ts:
- Test ShellAdapter.openSession calls execa with correct arguments
- Test TerminalManager with preferred='shell' returns ShellAdapter
- Test TerminalManager with preferred='auto' tries adapters in order
- Mock isAvailable to control which adapter is selected

packages/cli/src/__tests__/resume.test.ts:
- Seed DB with sessions
- Mock TerminalManager
- Test open <id> resolves correct session and calls resume
- Test last picks the most recently modified session
- Test resume <uuid> passes the UUID directly
- Test with non-existent session shows error
```

---

## Prompt 9: CLI Interactive Picker + Current Session

```text
Add the interactive fuzzy picker and "current" session support to Iris CLI.

Context: All basic CLI commands work. We need two more features:
1. `iris pick` — interactive session selector
2. "current" keyword support for note, tag, pin, show commands

1. packages/cli/src/commands/pick.ts
   - Command: iris pick
   - Options: --terminal <type>
   - Loads recent sessions (limit 100) from DB
   - Uses an interactive fuzzy finder
   - For the fuzzy picker, use the 'enquirer' package (or '@inquirer/search')
     that provides autocomplete/search prompt
   - Display format per item: "[repo] title/prompt — branch — 2h ago"
   - User types to filter, arrow keys to navigate, Enter to select
   - On selection, resume the session via TerminalManager
   - If stdin is not a TTY, print error and exit

2. packages/cli/src/current-session.ts
   - Function resolveCurrentSession(repo: SessionRepo): SessionWithTags
   - Resolution order:
     a) Check IRIS_SESSION_ID environment variable → look up by claude_session_id
     b) Detect current project path from cwd (find git root or use cwd)
     c) Find the most recently modified session for that project_path
     d) If no match, throw error: "Cannot determine current session.
        Use a session ID instead, or run from within a project directory."

3. Update resolveSession in packages/cli/src/resolve-session.ts:
   - If the argument is "current", call resolveCurrentSession
   - Otherwise, existing numeric/UUID logic

   This automatically enables:
   - iris note current "stopped here"
   - iris tag add current wip
   - iris pin current
   - iris show current
   - iris open current

   No changes needed to those command files — they already use resolveSession.

Wire pick command into bin.ts.

Tests:

packages/cli/src/__tests__/current-session.test.ts:
- Test with IRIS_SESSION_ID env var set → resolves correctly
- Test with cwd matching a project_path → resolves to latest session
- Test with no match → throws descriptive error
- Use in-memory DB seeded with sessions for different project paths

packages/cli/src/__tests__/pick.test.ts:
- Since interactive prompts are hard to test, test the data preparation:
  - Test that session list is loaded and formatted correctly for the picker
  - Test that selection maps to the correct session ID
- Mock the interactive prompt to return a predetermined selection
```

---

## Prompt 10: Web API Server — Read Endpoints

```text
Build the Fastify web API server for Iris with read endpoints.

Context: @iris/core provides all database and repository logic. The server
serves a REST API on http://127.0.0.1:4269.

Create the following in packages/server/src/:

1. app.ts — Fastify application factory
   - createApp(options: { db: Database, readonly?: boolean, authToken?: string }): FastifyInstance
   - Register @fastify/cors with origin restricted to localhost patterns
     (http://localhost:*, http://127.0.0.1:*)
   - Register routes
   - Decorate the fastify instance with repos (sessionRepo, projectRepo, tagRepo)
   - Return the app (don't call listen — that's for the caller)

2. routes/health.ts
   - GET /api/health
   - Returns: { status: "ok", version: "0.1.0", sessions_count: <number> }
   - sessions_count from a simple SELECT COUNT(*) on sessions

3. routes/sessions.ts — Session read routes
   - GET /api/sessions
     Query params (all optional):
     - q: string (full-text search)
     - repo: string
     - branch: string
     - tag: string
     - pinned: boolean
     - archived: boolean
     - sidechains: boolean
     - limit: number (default 50, max 200)
     - offset: number (default 0)
     - sort: 'modified' | 'created' | 'messages'

     Response: { sessions: SessionWithTags[], total: number, limit: number, offset: number }

   - GET /api/sessions/:id
     - id can be internal numeric ID
     - Returns full session with tags
     - 404 if not found

4. routes/projects.ts
   - GET /api/projects
   - Returns: { projects: (Project & { session_count: number })[] }

5. routes/tags.ts
   - GET /api/tags
   - Returns: { tags: (Tag & { count: number })[] }

6. Use Zod or Fastify's built-in schema validation for query params.
   Use the Zod schemas you already have where possible.

Export createApp from @iris/server index.

Tests (packages/server/src/__tests__/read-routes.test.ts):
- Use Fastify's inject() method for testing (no actual HTTP server needed)
- Create in-memory DB, run migrations, seed with test sessions
- Test GET /api/health returns correct format and count
- Test GET /api/sessions returns paginated list
- Test GET /api/sessions?q=keyword returns FTS results
- Test GET /api/sessions?repo=myrepo filters correctly
- Test GET /api/sessions?pinned=true filters correctly
- Test GET /api/sessions?limit=5&offset=2 pagination works
- Test GET /api/sessions/:id returns session detail
- Test GET /api/sessions/999 returns 404
- Test GET /api/projects returns projects with counts
- Test GET /api/tags returns tags with counts
```

---

## Prompt 11: Web API Mutations + Auth

```text
Add mutation endpoints and bearer token authentication to the Iris web API.

Context: The Fastify server has read endpoints. Mutation endpoints need to be
protected with a bearer token. The token is configured at server creation.

1. packages/server/src/middleware/auth.ts
   - Fastify preHandler hook that checks Authorization header
   - Expected format: "Bearer <token>"
   - If token doesn't match the configured authToken, return 401
   - If authToken is not configured (empty/null), allow all requests (dev mode)
   - If server is in readonly mode, return 403 for ALL mutation endpoints

2. packages/server/src/routes/session-mutations.ts
   - All routes use the auth preHandler

   POST /api/sessions/:id/note
   - Body: { note: string }
   - Validates session exists (404 if not)
   - Calls sessionRepo.updateNote
   - Returns: { ok: true, session: SessionWithTags }

   POST /api/sessions/:id/pin
   - Body: { pinned: boolean }
   - Calls sessionRepo.updatePin
   - Returns: { ok: true, session: SessionWithTags }

   POST /api/sessions/:id/archive
   - Body: { archived: boolean }
   - Calls sessionRepo.updateArchive
   - Returns: { ok: true, session: SessionWithTags }

   POST /api/sessions/:id/tags
   - Body: { add?: string[], remove?: string[] }
   - Calls addTag/removeTag for each
   - Returns: { ok: true, session: SessionWithTags }

   POST /api/sessions/:id/resume
   - Body: { terminal?: 'auto' | 'iterm' | 'terminal_app' | 'kitty' | 'shell' }
   - Looks up session, gets claude_session_id
   - Uses TerminalManager from @iris/core to resume
   - Returns: { ok: true, claude_session_id: string, terminal: string }

3. Register mutation routes in app.ts.

4. Update createApp to accept authToken and readonly options.

Tests (packages/server/src/__tests__/mutation-routes.test.ts):
- Seed DB with test sessions
- Configure app with authToken = "test-token-123"

- Test POST /api/sessions/:id/note without token → 401
- Test POST /api/sessions/:id/note with wrong token → 401
- Test POST /api/sessions/:id/note with correct token → 200, note saved
- Test POST /api/sessions/:id/pin → toggles pin
- Test POST /api/sessions/:id/archive → archives session
- Test POST /api/sessions/:id/tags with add/remove → tags updated
- Test POST /api/sessions/:id/resume (mock TerminalManager) → returns success
- Test mutation on non-existent session → 404

- Test readonly mode: all mutations return 403

- Test with no authToken configured: mutations work without header (dev mode)
```

---

## Prompt 12: Web UI Scaffolding + Dashboard

```text
Build the web UI foundation and dashboard for Iris.

Context: The Fastify server provides a REST API at /api/*. The Vite dev server
proxies /api to the backend. The web UI uses React, TanStack Router, TanStack Query,
and Tailwind CSS.

First, install and configure shadcn/ui in the @iris/web package:
- Initialize shadcn/ui with the "new-york" style, zinc base color, CSS variables
- Add these shadcn components: button, input, badge, card, table,
  separator, skeleton, scroll-area, dropdown-menu, tooltip

Create the following:

1. packages/web/src/lib/api.ts — API client
   - Base URL from environment or default to window.location.origin
   - fetchSessions(params: SessionFilter): Promise<PaginatedResult<Session>>
   - fetchSession(id: number): Promise<Session>
   - fetchProjects(): Promise<Project[]>
   - fetchTags(): Promise<Tag[]>
   - fetchHealth(): Promise<{ status: string, version: string, sessions_count: number }>
   - All functions use fetch(), handle errors, parse JSON
   - Accept an optional authToken for mutation calls (stored in localStorage)

2. packages/web/src/lib/types.ts — Frontend TypeScript types
   - Mirror the API response types (Session, Project, Tag, etc.)
   - Don't import from @iris/core — keep the web package independent

3. packages/web/src/routes/ — TanStack Router setup
   - __root.tsx — Root layout with sidebar navigation
   - index.tsx — Dashboard (home page)
   - sessions/$sessionId.tsx — Session detail page (placeholder for now)
   - projects/$projectId.tsx — Project view (placeholder for now)

4. packages/web/src/components/layout/
   - Sidebar.tsx — Left sidebar with:
     - Iris logo/title at top
     - "Dashboard" link
     - "Projects" section listing all projects (fetched via API)
     - Each project is a link
   - Header.tsx — Top bar with global search input
   - Layout.tsx — Combines Sidebar + Header + main content area

5. packages/web/src/components/sessions/
   - SessionTable.tsx — Compact table showing sessions
     - Columns: Title (custom_title or first_prompt truncated), Repo, Branch,
       Modified (relative time), Messages, Pinned (star icon)
     - Each row is clickable (navigates to session detail)
     - Resume button on each row
   - SessionCard.tsx — Card variant for pinned sessions
     - Shows title, note preview, repo, branch, last modified
     - Resume button prominent

6. packages/web/src/pages/Dashboard.tsx — Main dashboard
   - Uses TanStack Query to fetch sessions
   - Pinned sessions section at top (as cards)
   - Recent sessions section below (as table)
   - If no sessions, show a friendly empty state
   - Search bar at top filters in real-time (debounced, hits /api/sessions?q=)

7. packages/web/src/main.tsx — App entry point
   - Sets up TanStack Query provider
   - Sets up TanStack Router
   - Renders the app

8. Style everything with Tailwind. Keep the design clean and functional —
   dark theme preferred since this is a developer tool. Use zinc/slate color palette.

This prompt creates the READ-ONLY dashboard. No mutation UI yet.
The dashboard should feel fast and clean — no loading spinners for local data.

No tests for UI components in this prompt — we'll test the API integration
through the server tests and add E2E tests later.
```

---

## Prompt 13: Web UI Session Detail + Mutations

```text
Build the session detail page and mutation UI for the Iris web dashboard.

Context: The dashboard shows session lists. Now we need the detail page where
users can view full session info, edit notes, manage tags, and resume.

1. packages/web/src/lib/api.ts — Add mutation functions
   - updateNote(id: number, note: string): Promise<Session>
   - updatePin(id: number, pinned: boolean): Promise<Session>
   - updateArchive(id: number, archived: boolean): Promise<Session>
   - updateTags(id: number, add?: string[], remove?: string[]): Promise<Session>
   - resumeSession(id: number, terminal?: string): Promise<{ ok: boolean, terminal: string }>
   - All mutations send Authorization: Bearer <token> from localStorage
   - Add a setAuthToken(token: string) function that saves to localStorage
   - Add a getAuthToken() that reads from localStorage

2. packages/web/src/components/sessions/SessionDetail.tsx
   - Full session detail view
   - Header: title or first prompt, with pin/archive action buttons
   - Info grid: repo, branch, project path, created, modified, message count, status
   - Summary section (if available)
   - Note section:
     - Display current note (or "No note" placeholder)
     - Click to edit → inline textarea appears
     - Save button → calls updateNote mutation
     - Uses TanStack Query mutation with optimistic update
   - Tags section:
     - Display current tags as badges
     - "Add tag" input with autocomplete (fetch available tags)
     - Click X on badge to remove tag
     - Uses TanStack Query mutations
   - Resume button (large, primary, prominent at the top)
     - Calls resumeSession
     - Shows success toast/message

3. packages/web/src/routes/sessions/$sessionId.tsx
   - Uses TanStack Query to fetch session by ID
   - Renders SessionDetail component
   - Shows 404 message if session not found

4. packages/web/src/components/ui/
   - NoteEditor.tsx — Inline note editor (view mode / edit mode toggle)
   - TagEditor.tsx — Tag badge list with add/remove
   - ResumeButton.tsx — Styled resume button with loading state
   - RelativeTime.tsx — Renders relative time from ISO date string

5. Update SessionTable.tsx:
   - Add a resume button (play icon) on each row
   - Clicking the row navigates to detail
   - Clicking resume triggers the resume action

6. Add a simple toast/notification system for mutation feedback:
   - "Note saved"
   - "Session pinned"
   - "Resuming in iTerm..."
   Use a lightweight approach — a simple state-based notification that
   auto-dismisses after 3 seconds, positioned at top-right.

7. Auth token setup:
   - On first load, if no token in localStorage, check if server is in dev mode
     (no token required) by hitting /api/health
   - If mutations fail with 401, show a small input asking for the token
   - Store token in localStorage for future use
```

---

## Prompt 14: Web UI Project View + Search/Filters

```text
Build the project view and advanced search/filter UI for Iris web dashboard.

Context: The dashboard and session detail pages are built. We need project-level
navigation and proper filter/search UX.

1. packages/web/src/routes/projects/$projectId.tsx
   - Fetches project info
   - Fetches sessions filtered by repo name
   - Groups sessions by git_branch
   - Each branch group shows:
     - Branch name as header
     - Sessions in that branch as a compact list/table
     - Sorted by last modified within each group
   - Resume button on each session

2. packages/web/src/components/layout/Sidebar.tsx — Enhance
   - Fetch projects via /api/projects
   - Show each project with session count badge
   - Highlight current project when on a project route
   - Show repo_name (not full path) as the label
   - Sort by last_seen_at (most recent first)

3. packages/web/src/components/search/
   - SearchBar.tsx — Global search component
     - Text input with search icon
     - Debounced input (300ms)
     - On type, triggers search via /api/sessions?q=<query>
     - Results appear in a dropdown below the search bar
     - Each result shows: title, repo, branch, modified
     - Click result → navigate to session detail
     - Press Enter → navigate to full search results page

   - FilterBar.tsx — Filter chips component
     - Displays active filters as removable chips
     - Add filter dropdown: repo, branch, tag, pinned
     - When a filter is selected, add it as a chip and refetch sessions
     - Multiple filters combine with AND logic

4. packages/web/src/routes/search.tsx
   - Full search results page
   - Shows search query at top
   - Renders results as SessionTable
   - Supports all filters via URL query params
   - Pagination at bottom (Next/Previous)

5. Update Dashboard:
   - Integrate SearchBar in the header
   - Integrate FilterBar below the header
   - Filters update the session query in real-time

6. packages/web/src/hooks/
   - useSessionsQuery(filter: SessionFilter) — TanStack Query hook
     wrapping fetchSessions with proper cache keys based on filter params
   - useProjectsQuery() — TanStack Query hook for projects
   - useTagsQuery() — TanStack Query hook for tags
   - Extract these from existing inline useQuery calls to reduce duplication

Make sure URL state and query state stay in sync:
- When user applies filters on dashboard, URL updates with query params
- When user navigates to a URL with query params, filters are applied
- Browser back/forward works correctly with filters
```

---

## Prompt 15: Serve Command — Wiring Everything Together

```text
Build the `iris serve` command that starts the backend, indexer, and serves the web UI.

Context: We have @iris/core (DB, indexer, repos), @iris/server (Fastify API),
@iris/cli (commands), and @iris/web (React frontend). The `serve` command
needs to wire these all together.

1. packages/core/src/config.ts — Configuration manager
   - Interface IrisConfig with sections: server, terminal, indexer, ui, security
     (matching the config.toml format from the spec)
   - loadConfig(configPath?: string): IrisConfig
     - Default path: ~/.config/iris/config.toml
     - Parse TOML using smol-toml
     - Apply defaults for missing values
     - Validate with Zod
     - If file doesn't exist, return all defaults
   - getDefaultConfig(): IrisConfig
   - generateAuthToken(): string — generates a random 32-char hex token

2. packages/core/src/logger.ts — Logger setup
   - createLogger(options: { level?: string, logFile?: string }): Logger
   - Uses pino
   - Default log file: ~/.config/iris/logs/iris.log
   - Ensure log directory exists
   - Returns a pino logger instance

3. packages/server/src/static.ts — Static file serving
   - Fastify plugin that serves the built @iris/web files
   - In production: serves from packages/web/dist (or a resolved path)
   - Register under '/' (all non-/api routes serve index.html for SPA routing)
   - Use @fastify/static

4. packages/cli/src/commands/serve.ts
   - Command: iris serve
   - Options: --port <n>, --no-open, --readonly, --log-level <level>
   - Steps:
     a) Load config from ~/.config/iris/config.toml (or defaults)
     b) Set up logger
     c) Open database, run migrations
     d) Generate auth token if not configured (print to console)
     e) Create Fastify app with repos, auth token, readonly flag
     f) Register static file serving for web UI
     g) Start indexer with polling (configurable interval)
     h) Start Fastify on configured host:port
     i) Print startup info: URL, auth token, indexed sessions count
     j) If --no-open is not set, open browser to the URL
     k) Handle SIGINT/SIGTERM: stop indexer, close DB, shutdown Fastify
   - Uses the 'open' package to open browser (or child_process on macOS)

5. packages/cli/src/commands/config.ts
   - Command: iris config
   - Prints current effective configuration (loaded + defaults)
   - If config file doesn't exist, say so and show defaults

6. packages/web/vite.config.ts — Update
   - In dev mode, proxy /api/* to http://127.0.0.1:4269
   - In production, the server handles everything

7. Update the root package.json with a convenience script:
   - "start": runs iris serve (after build)

Wire serve and config commands into bin.ts.
Export loadConfig, createLogger, generateAuthToken from @iris/core.

Tests:
- packages/core/src/__tests__/config.test.ts:
  - Test loadConfig with missing file returns defaults
  - Test loadConfig with valid TOML
  - Test loadConfig with partial TOML (missing sections use defaults)
  - Test generateAuthToken returns valid hex string of correct length

- packages/server/src/__tests__/serve-integration.test.ts:
  - Test that createApp with all options wired creates a working server
  - Test /api/health endpoint through the full app
  - Test that static serving falls back to index.html (mock the dist directory)
```

---

## Prompt 16: Polish, Error Handling, and Integration Tests

```text
Final polish pass for Iris MVP: error handling, edge cases, and integration tests.

Context: All features are built and wired. This prompt focuses on robustness.

1. Error handling improvements across all packages:

   @iris/core:
   - Indexer: catch and log errors per-session (don't fail entire scan)
   - Parser: handle truncated/corrupt JSON files gracefully
   - DB: handle locked database with retries (busy_timeout pragma)
   - Add PRAGMA busy_timeout = 5000 to db initialization

   @iris/cli:
   - Wrap all command handlers in try/catch
   - Print user-friendly error messages to stderr (not stack traces)
   - Use process.exitCode instead of process.exit() where possible
   - Handle EPIPE (piping to head/grep) silently

   @iris/server:
   - Add global Fastify error handler
   - Log errors with request context
   - Return structured error responses: { error: string, code: number }
   - Validate all :id params (must be positive integer)

2. Edge cases:

   - Empty database (first run): all commands should work, show helpful empty states
   - Sessions with very long first_prompt/summary: truncate in table output
   - Unicode in notes/tags: ensure SQLite handles correctly
   - Concurrent scan and mutation: WAL mode handles this, but test it
   - Config directory doesn't exist: create it automatically
   - Database file doesn't exist: create it automatically

3. Integration tests:

   packages/core/src/__tests__/integration.test.ts:
   - Full pipeline test:
     a) Create temp dir with realistic mock Claude Code data (3 projects,
        10+ sessions with varying data)
     b) Create fresh DB
     c) Run indexer.scan()
     d) Verify all sessions indexed correctly
     e) Add notes, tags, pins via repo
     f) Run indexer.scan() again
     g) Verify user data preserved
     h) Search via FTS, verify results
     i) Test pagination
     j) Test project list with counts
     k) Test tag list with counts

   packages/server/src/__tests__/api-integration.test.ts:
   - Full API test through Fastify inject:
     a) Seed DB with test data
     b) Test complete flow: list → show → note → pin → tag → search
     c) Verify mutations require auth
     d) Verify readonly mode blocks mutations
     e) Test pagination and filtering combinations

4. Create packages/core/src/ensure-dirs.ts:
   - Function ensureDataDir() that creates ~/.config/iris/ and subdirectories
   - Function ensureLogDir() that creates ~/.config/iris/logs/
   - Called on startup before any DB or log operations

5. Update bin.ts error handling:
   - If database is corrupted, offer to recreate it
   - If Claude Code data dir doesn't exist (~/.claude/projects/),
     warn but don't crash

6. Add a root-level README.md with:
   - One-paragraph description
   - Quick start (install, run)
   - Available CLI commands
   - How to start the web UI
```

---

## Dependency Graph

```
Prompt 1:  Scaffolding
    ↓
Prompt 2:  Database Schema
    ↓
Prompt 3:  Session Repository
    ↓
Prompt 4:  Claude Data Parser
    ↓
Prompt 5:  Indexer ← (ties together Prompt 3 + 4)
    ↓
Prompt 6:  CLI Foundation ← (uses Prompt 3 + 5)
    ↓
Prompt 7:  CLI Mutations ← (extends Prompt 6)
    ↓
Prompt 8:  CLI Resume ← (extends Prompt 6 + 7)
    ↓
Prompt 9:  CLI Picker + Current ← (extends Prompt 8)
    ↓
Prompt 10: Web API Read ← (uses Prompt 3)
    ↓
Prompt 11: Web API Mutations ← (extends Prompt 10)
    ↓
Prompt 12: Web UI Dashboard ← (uses Prompt 10)
    ↓
Prompt 13: Web UI Detail ← (uses Prompt 11 + 12)
    ↓
Prompt 14: Web UI Projects ← (extends Prompt 12 + 13)
    ↓
Prompt 15: Serve Command ← (wires Prompt 5 + 10-14)
    ↓
Prompt 16: Polish ← (all prompts)
```

## Notes for the Implementer

- Each prompt is self-contained but builds on previous work. Always verify the
  previous step's tests pass before starting the next.
- The `@iris/core` package is the foundation — get it right and well-tested.
- The CLI and Server are thin layers over core — most logic lives in core.
- The Web UI is the only package that doesn't import from core (it talks to the API).
- Use in-memory SQLite (":memory:") for all unit/integration tests — no file I/O.
- For tests that need a mock filesystem (parser, indexer), use a temp directory
  created in beforeEach and cleaned in afterEach.
- The total codebase should be moderate in size. Avoid over-abstraction.
