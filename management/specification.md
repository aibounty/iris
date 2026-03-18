# Iris — Product Specification v1.0

## Terminal-First Session Manager for Claude Code

---

## 1. Product Summary

**Iris** is a local session manager for Claude Code that adds search, notes, resume, and a web dashboard on top of the terminal workflow — without replacing Claude Code itself.

The user continues to work through Claude Code as usual. Iris runs alongside it:

- Automatically indexes sessions from Claude Code's local data
- Stores metadata, notes, and tags in a local SQLite database
- Provides fast search and resume from CLI or web UI
- Stays local, safe, and non-intrusive

---

## 2. Non-Goals

Iris must **not**:

- Replace or wrap Claude Code's core functionality
- Run its own AI runtime or require separate API tokens
- Execute arbitrary shell commands from the UI
- Store state in the cloud by default
- Require external accounts or authentication services
- Break the existing terminal workflow

---

## 3. Product Architecture

The system consists of four layers:

### 3.1 Core

Local engine that:

- Reads and indexes Claude Code session data from `~/.claude/`
- Stores enriched records in SQLite
- Exposes an internal API for search, notes, tags, and resume

### 3.2 CLI

Primary interface for power users:

- Session listing, search, resume
- Notes, tags, pin/archive
- Interactive fuzzy picker
- JSON output for scripting

### 3.3 Web API

Local HTTP server (Fastify or Hono) serving:

- RESTful endpoints for session queries and mutations
- Auth-token-protected mutation endpoints
- localhost-only binding

### 3.4 Web UI

Local browser dashboard (React + Vite):

- Session overview with filters
- Project grouping
- Notes and tag management
- One-click resume

---

## 4. Core Use Cases

### 4.1 Return to a Session

The user wants to quickly find an old session and continue working.

1. Opens `iris list` or the web dashboard
2. Finds the session by repo, branch, title, note, or summary
3. Selects Resume
4. A terminal opens with `claude --resume <session_id>`

### 4.2 Search by Context

The user remembers only "something about auth refresh" or "redis migration".

1. Runs `iris search auth` or uses the web UI search
2. The system finds sessions matching title, note, tags, repo, branch, or summary

### 4.3 Save Context Manually

The user finishes work and wants to record where they stopped.

1. Runs `iris note current "stopped at retry policy for 429"`
2. The note is saved in the database
3. Visible later in both CLI and web UI

### 4.4 Navigate by Project

The user works across multiple repos and branches.

1. Filters by repo or branch
2. Views active and recent sessions for a specific project

### 4.5 Automatic Session Tracking

The user no longer writes down session IDs manually.

1. Iris automatically indexes new sessions from Claude Code's local data
2. All identifiers and metadata are captured and stored

---

## 5. Claude Code Data Model

Iris reads Claude Code's local session data. This section documents the data source format as of the current Claude Code version.

### 5.1 Directory Structure

```
~/.claude/
├── projects/                           # Project-specific session data
│   └── {encoded_path}/                 # e.g., -Volumes-PavelData-ai-myproject
│       ├── sessions-index.json         # Index of all sessions for this project
│       └── {sessionId}.jsonl           # Full conversation log per session
└── history.jsonl                       # Global history (all projects)
```

**Path encoding**: filesystem paths have slashes replaced with hyphens.
Example: `/Volumes/PavelData/ai/myproject` → `-Volumes-PavelData-ai-myproject`

### 5.2 Session Index Format

Each project directory contains a `sessions-index.json`:

```json
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
```

### 5.3 Available Fields from Index

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | UUID string | Claude Code session identifier |
| `fullPath` | string | Absolute path to the JSONL conversation file |
| `fileMtime` | number | File modification time (ms since epoch) |
| `firstPrompt` | string | First user message or "No prompt" |
| `summary` | string | AI-generated session summary |
| `messageCount` | number | Total messages in session |
| `created` | ISO 8601 | Session creation timestamp |
| `modified` | ISO 8601 | Last modification timestamp |
| `gitBranch` | string | Git branch at session time (may be empty) |
| `projectPath` | string | Absolute working directory path |
| `isSidechain` | boolean | Whether this is a sub-conversation |
| `customTitle` | string? | Optional user-provided title |

### 5.4 JSONL Conversation Format (for future deep indexing)

Each session's JSONL file contains message objects with additional fields:

- `cwd` — working directory per message
- `gitBranch` — branch per message (can change mid-session)
- `slug` — friendly session slug (e.g., "expressive-fluttering-hopper")
- `version` — Claude Code version
- `message.usage` — token usage stats (input, output, cache)
- `message.model` — model used (e.g., "claude-opus-4-6")
- `parentUuid` — message threading
- Tool call details, file changes, task data

### 5.5 Indexing Strategy

**MVP**: Read `sessions-index.json` files from all project directories under `~/.claude/projects/`. This provides session ID, summary, first prompt, timestamps, git branch, project path, and message count — sufficient for search, listing, and resume.

**Future versions**: Parse individual JSONL files for richer data — token usage analytics, tool call history, file change tracking, model usage breakdown.

---

## 6. Functional Requirements

### 6.1 Session Discovery

The indexer scans `~/.claude/projects/*/sessions-index.json` files and aggregates session entries into the local SQLite database.

**Modes of operation**:

- **Startup scan**: full scan on application start
- **Periodic polling**: re-scan at configurable intervals (default: 15 seconds)
- **Optional filesystem watcher**: using chokidar for real-time detection

**Indexed fields** (from Claude Code data + Iris enrichment):

| Field | Source |
|-------|--------|
| claude_session_id | sessions-index.json |
| first_prompt | sessions-index.json |
| summary | sessions-index.json |
| message_count | sessions-index.json |
| created_at | sessions-index.json |
| modified_at | sessions-index.json |
| git_branch | sessions-index.json |
| project_path | sessions-index.json |
| custom_title | sessions-index.json |
| is_sidechain | sessions-index.json |
| jsonl_path | sessions-index.json (fullPath) |
| note | User-provided via Iris |
| tags | User-provided via Iris |
| pinned | User-provided via Iris |
| archived | User-provided via Iris |
| repo_name | Derived from project_path |

### 6.2 Session Registry

Local registry supporting:

- Create/update session records (idempotent upsert by claude_session_id)
- Mark as active/inactive based on modification timestamps
- Pin/unpin, archive/unarchive
- Attach/edit notes
- Attach/remove tags
- Search, filter, sort

### 6.3 Resume

Resume a session through Claude Code.

**Supported variants**:

| Command | Behavior |
|---------|----------|
| Resume by internal ID | Look up claude_session_id, then resume |
| Resume by claude_session_id | Direct resume |
| Resume latest | Resume most recently modified session |
| Resume from picker | Interactive fuzzy selection, then resume |

**Action**: Executes `claude --resume <session_id>` in the appropriate terminal.

**Terminal adapters** (priority order):

1. iTerm2 (AppleScript)
2. Terminal.app (AppleScript)
3. kitty (remote control protocol)
4. Fallback: spawn in current shell

### 6.4 Search

Search across:

- `first_prompt`
- `summary`
- `custom_title`
- `note`
- `tags`
- `repo_name`
- `project_path`
- `git_branch`
- `claude_session_id`

Search capabilities:

- Substring matching
- Full-text search (SQLite FTS5)
- Fuzzy matching (for interactive picker)
- Sort by modified_at (default), created_at, message_count
- Filters: pinned, archived, repo, branch, tag, sidechain

### 6.5 Notes and Tags

Users can:

- Add/edit a note on any session
- Add/remove tags on any session
- Mark sessions as pinned
- Archive/unarchive sessions

### 6.6 Current Session Helpers

CLI supports commands targeting the "current" session:

- `iris note current "text"`
- `iris tag current add <tag>`
- `iris pin current`
- `iris show current`

**Current session resolution** (in order):

1. `IRIS_SESSION_ID` environment variable (set by wrapper mode)
2. Most recently modified session matching the current working directory's project path
3. Fail with a clear error if ambiguous

### 6.7 Wrapper Mode (Optional)

User can launch Claude Code via `iris wrap` (alias-able to `claude`).

What it does:

1. Captures current cwd, repo root, git branch
2. Launches `claude` with all passed arguments
3. Sets `IRIS_SESSION_ID` for child process detection
4. Enables reliable "current session" resolution

This is optional. Passive discovery works without it.

### 6.8 Web Dashboard

See section 11 for full Web UI specification.

### 6.9 Read-Only Safe Mode

The web UI supports a mode where mutation endpoints and resume are disabled. Controlled by configuration. In this mode, the dashboard is view-only.

---

## 7. Non-Functional Requirements

### 7.1 Security

- Backend binds only to `127.0.0.1`
- No remote access by default
- No endpoint for arbitrary shell execution
- Mutation endpoints require a local bearer token
- Session IDs and paths are validated (no path traversal)
- Resume commands are assembled safely without shell interpolation
- All executable commands use a strict whitelist
- No telemetry by default

### 7.2 Performance

- Cold start: under 2 seconds on a typical machine
- List/search over thousands of sessions: interactive response times
- Indexer runs in the background without blocking user work
- Web UI dashboard loads instantly (local data, no network)

### 7.3 Reliability

- SQLite as source of truth with WAL mode
- Idempotent indexing (re-scanning produces the same result)
- Error logging for all failures
- Graceful degradation if Claude Code's data format changes
- Missing or corrupt session files are skipped, not fatal

### 7.4 Locality

- All data stored locally by default
- No cloud services required
- No external account or authentication needed

### 7.5 Extensibility

Architecture should allow future additions:

- macOS app / menu bar client
- TUI mode (ink or blessed)
- AI-powered summaries
- Session snapshots
- Export/import
- Cross-machine sync

---

## 8. Data Storage

### 8.1 Database

**Engine**: SQLite via better-sqlite3
**Path**: `~/.config/iris/data.db`
**Mode**: WAL (Write-Ahead Logging) for concurrent read/write

### 8.2 Schema

#### sessions

```sql
CREATE TABLE sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  claude_session_id TEXT    UNIQUE NOT NULL,
  first_prompt      TEXT,
  summary           TEXT,
  custom_title      TEXT,
  note              TEXT,
  message_count     INTEGER NOT NULL DEFAULT 0,
  is_sidechain      INTEGER NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL DEFAULT 'active',   -- active | inactive | archived
  pinned            INTEGER NOT NULL DEFAULT 0,
  project_path      TEXT,
  repo_name         TEXT,
  git_branch        TEXT,
  jsonl_path        TEXT,
  started_at        TEXT    NOT NULL,  -- ISO 8601
  last_seen_at      TEXT    NOT NULL,  -- ISO 8601
  archived_at       TEXT,
  source            TEXT    NOT NULL DEFAULT 'passive',  -- passive | wrapper
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

#### tags

```sql
CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    UNIQUE NOT NULL
);
```

#### session_tags

```sql
CREATE TABLE session_tags (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE(session_id, tag_id)
);
```

#### session_events

```sql
CREATE TABLE session_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type   TEXT    NOT NULL,  -- indexed | noted | tagged | resumed | pinned | archived
  payload_json TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

#### projects

```sql
CREATE TABLE projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_path TEXT    UNIQUE NOT NULL,
  repo_name    TEXT    NOT NULL,
  last_seen_at TEXT    NOT NULL
);
```

#### config

```sql
CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

#### schema_version

```sql
CREATE TABLE schema_version (
  version    INTEGER NOT NULL,
  applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

### 8.3 Indexes

```sql
CREATE INDEX idx_sessions_last_seen     ON sessions(last_seen_at DESC);
CREATE INDEX idx_sessions_repo          ON sessions(repo_name);
CREATE INDEX idx_sessions_branch        ON sessions(git_branch);
CREATE INDEX idx_sessions_status        ON sessions(status);
CREATE INDEX idx_sessions_pinned        ON sessions(pinned, last_seen_at DESC);
CREATE INDEX idx_sessions_project_path  ON sessions(project_path);
CREATE INDEX idx_session_events_session ON session_events(session_id, created_at DESC);
```

### 8.4 Full-Text Search

```sql
CREATE VIRTUAL TABLE sessions_fts USING fts5(
  first_prompt,
  summary,
  custom_title,
  note,
  repo_name,
  git_branch,
  content=sessions,
  content_rowid=id
);
```

FTS triggers maintain sync on INSERT, UPDATE, DELETE of the sessions table.

---

## 9. CLI Specification

**Binary**: `iris`

### 9.1 Commands

#### Session Listing

```
iris list [options]
```

Options:
- `--repo <name>` — filter by repository name
- `--branch <name>` — filter by git branch
- `--tag <tag>` — filter by tag
- `--pinned` — show only pinned sessions
- `--archived` — include archived sessions
- `--sidechains` — include sidechain sessions
- `--limit <n>` — max results (default: 20)
- `--json` — output as JSON

Default output: compact table with columns [ID, Title/Prompt, Repo, Branch, Modified, Pinned].

#### Resume Commands

```
iris open <id>                    # Resume by internal ID
iris resume <claude_session_id>   # Resume by Claude session ID
iris last                         # Resume most recently modified session
iris pick                         # Interactive fuzzy picker
```

Options for all resume commands:
- `--terminal <type>` — force terminal: `auto`, `iterm`, `terminal_app`, `kitty`, `shell`

#### Search

```
iris search <query> [options]
```

Options:
- `--repo <name>`
- `--branch <name>`
- `--tag <tag>`
- `--limit <n>`
- `--json`

#### Session Details

```
iris show <id>
iris show current
```

Displays: title, first prompt, summary, note, tags, repo, branch, project path, timestamps, message count, pinned/archived status.

#### Notes

```
iris note <id> "<text>"
iris note current "<text>"
```

Sets or replaces the note on a session.

#### Tags

```
iris tag add <id> <tag>
iris tag remove <id> <tag>
iris tag add current <tag>
```

#### Pin / Archive

```
iris pin <id>
iris unpin <id>
iris archive <id>
iris unarchive <id>
```

All also accept `current` in place of `<id>`.

#### Maintenance

```
iris scan                # Force re-index
iris serve [options]     # Start web server + UI
iris config              # Show current configuration
```

`iris serve` options:
- `--port <n>` — override port (default: 4269)
- `--no-open` — don't open browser automatically
- `--readonly` — start in read-only mode

#### Wrapper

```
iris wrap [claude args...]    # Launch Claude Code with session tracking
```

### 9.2 CLI UX Rules

- Default output is a compact, aligned table
- All read commands support `--json` for scripting
- Non-interactive mode works (no TTY required for list/search/show)
- Errors are short, human-readable, written to stderr
- Exit codes: 0 = success, 1 = general error, 2 = not found

---

## 10. Web API Specification

**Base URL**: `http://127.0.0.1:4269`

### 10.1 Read Endpoints

#### `GET /health`

Returns service status.

```json
{ "status": "ok", "version": "1.0.0", "sessions_count": 142 }
```

#### `GET /sessions`

Query parameters:

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Full-text search query |
| `repo` | string | Filter by repo name |
| `branch` | string | Filter by git branch |
| `tag` | string | Filter by tag |
| `pinned` | boolean | Filter pinned only |
| `archived` | boolean | Include archived |
| `sidechains` | boolean | Include sidechains |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |
| `sort` | string | Sort field: `modified`, `created`, `messages` |

Response:

```json
{
  "sessions": [...],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

#### `GET /sessions/:id`

Returns full session details including tags and recent events.

#### `GET /projects`

Returns all known projects with session counts.

```json
{
  "projects": [
    {
      "id": 1,
      "project_path": "/Volumes/PavelData/ai/myproject",
      "repo_name": "myproject",
      "session_count": 23,
      "last_seen_at": "2025-03-15T12:30:00.000Z"
    }
  ]
}
```

#### `GET /tags`

Returns all tags with usage counts.

```json
{
  "tags": [
    { "id": 1, "name": "backend", "count": 12 },
    { "id": 2, "name": "bugfix", "count": 7 }
  ]
}
```

### 10.2 Mutation Endpoints

All mutation endpoints require `Authorization: Bearer <token>` header.

#### `POST /sessions/:id/note`

```json
{ "note": "stopped at auth refresh retry" }
```

#### `POST /sessions/:id/pin`

```json
{ "pinned": true }
```

#### `POST /sessions/:id/archive`

```json
{ "archived": true }
```

#### `POST /sessions/:id/tags`

```json
{ "add": ["backend"], "remove": ["wip"] }
```

#### `POST /sessions/:id/resume`

```json
{ "terminal": "auto" }
```

Supported terminal values: `auto`, `iterm`, `terminal_app`, `kitty`, `shell`.

Returns:

```json
{ "ok": true, "claude_session_id": "738269ac-...", "terminal": "iterm" }
```

### 10.3 Security Rules

- Read endpoints: no token required in localhost mode
- Mutation endpoints: require bearer token
- CORS: allow only localhost origins
- No generic exec endpoints
- All IDs validated as integers or UUIDs
- Path parameters sanitized

---

## 11. Web UI Specification

### 11.1 Pages

#### Dashboard (Home)

Displays:

- Search bar (top, always visible)
- Pinned sessions section
- Recent sessions (sorted by last modified)
- Projects sidebar or filter panel
- Quick filter chips (by repo, branch, tag)

#### Session Detail

Displays:

- Title / first prompt
- AI-generated summary
- Note (editable inline)
- Tags (editable)
- Repository and branch
- Project path and working directory
- Timestamps (created, last modified)
- Message count
- Actions: Resume, Pin/Unpin, Archive/Unarchive

#### Project View

Displays:

- All sessions for a specific repository
- Grouped by branch
- Sorted by activity (most recent first)

### 11.2 Key Components

- Global search with instant results
- Filter chips (repo, branch, tag, pinned)
- Session table (compact) / session cards (detail)
- Inline note editor
- Tag editor with autocomplete
- Resume button (primary action, prominent)
- Recent activity timeline

### 11.3 UX Principles

- Dashboard loads instantly (local data, no spinners)
- Resume is the primary action — always visible, always one click
- "Where I left off" note is visible directly in session list/cards
- Pinned sessions appear at the top, always accessible
- Current repo is auto-detected and highlighted when UI is opened from a project directory (via query param or detection)
- Responsive layout but optimized for desktop (this is a developer tool)

---

## 12. Integration with Claude Code

### 12.1 Passive Discovery (Default)

Iris reads existing `sessions-index.json` files from `~/.claude/projects/`.

**Pros**: Zero friction, no workflow change required.
**Cons**: "Current session" detection is heuristic (based on cwd + most recent).

### 12.2 Wrapper Mode (Recommended for Best Results)

User runs `iris wrap` instead of `claude` directly (can be aliased).

**Pros**: Reliable current session mapping, captures start context.
**Cons**: Requires user to change their launch habit.

### 12.3 Recommended Approach for v1

Support both modes:

- Passive discovery as default (works out of the box)
- Wrapper mode documented as recommended for "current session" features

---

## 13. Configuration

**File**: `~/.config/iris/config.toml`

```toml
[server]
host = "127.0.0.1"
port = 4269
require_token_for_reads = false
readonly = false

[terminal]
preferred = "auto"    # auto | iterm | terminal_app | kitty | shell

[indexer]
scan_on_start = true
poll_interval_sec = 15
claude_data_dir = "~/.claude"   # override if non-standard

[ui]
open_browser_on_serve = true

[security]
enable_mutation_token = true
token = ""   # auto-generated on first run if empty
```

---

## 14. Logging

**Log file**: `~/.config/iris/logs/iris.log`

**Logged events**:

- Startup and shutdown
- Scan results (sessions found, new, updated)
- Parse failures (corrupt index files, format changes)
- Database migrations
- Resume actions
- Auth failures on mutation endpoints
- Unhandled errors

**Levels**: `error`, `warn`, `info`, `debug`

**Default level**: `info` (configurable via `--log-level` flag or config)

---

## 15. Migrations and Compatibility

- Schema version tracked in `schema_version` table
- Migrations are idempotent and forward-only
- If Claude Code changes its data format, the indexer degrades gracefully:
  - Unknown fields are ignored
  - Missing fields default to null/empty
  - Unparseable files are skipped with a warning
- Non-critical fields (summary, git_branch, etc.) may be empty without breaking functionality

---

## 16. Technology Stack

### Backend / CLI (TypeScript)

| Concern | Library |
|---------|---------|
| CLI framework | Commander.js |
| HTTP server | Fastify or Hono |
| Database | better-sqlite3 |
| File watching | chokidar |
| Fuzzy search | fuse.js (for interactive picker) |
| Full-text search | SQLite FTS5 (built-in) |
| Config parsing | @iarna/toml or smol-toml |
| Logging | pino |
| Process spawning | execa |

### Frontend (TypeScript)

| Concern | Library |
|---------|---------|
| Framework | React 19 |
| Build tool | Vite |
| Routing | TanStack Router |
| Data fetching | TanStack Query |
| UI components | shadcn/ui (Radix + Tailwind) |

### Future

| Concern | Library |
|---------|---------|
| Desktop app | Tauri |
| TUI | ink |

---

## 17. MVP Scope

### Included

- SQLite session registry
- Passive session discovery from Claude Code data
- CLI commands: `list`, `search`, `open`, `last`, `pick`, `show`, `note`, `tag`, `pin`, `unpin`, `archive`, `unarchive`, `scan`, `serve`
- Web dashboard with session list, detail page, search, filters
- Safe localhost-only API with token-protected mutations
- Configuration file support
- Basic logging

### Excluded from MVP

- Cloud sync
- Multi-user mode
- AI-powered summaries (beyond what Claude Code already provides)
- Full terminal embedding in browser
- macOS menu bar app
- Mobile UI
- Advanced analytics (token usage, model breakdown)
- Wrapper mode (passive discovery only in MVP)
- TUI mode
- Export/import

---

## 18. Roadmap

### v1.1

- Wrapper mode (`iris wrap`)
- Session snapshots
- Keyboard shortcuts in web UI
- Export/import sessions database

### v1.2

- TUI mode (ink-based)
- Deep JSONL parsing for analytics (token usage, model stats)
- Git worktree awareness
- PR/issue linking

### v2.0

- Tauri desktop app
- macOS menu bar integration
- Spotlight-like launcher
- Optional encrypted sync between machines

---

## 19. MVP Acceptance Criteria

The MVP is ready when:

1. A user can stop writing down session IDs manually
2. New Claude Code sessions automatically appear in the registry after a scan
3. Any session can be found in under 10 seconds via CLI or web UI
4. Resume works from both CLI and web UI
5. Notes ("where I left off") are saved and visible in both interfaces
6. The tool runs safely on localhost only
7. The user can adopt it without changing their existing Claude Code workflow

---

## 20. Example User Scenario

1. User launches Claude Code in `payments-service` project
2. Iris detects the new session on its next scan cycle
3. The database stores: session_id, repo, branch, project path, first prompt, summary, timestamps
4. User finishes work and runs: `iris note current "stopped at retry policy for 429"`
5. Two days later, user opens the web dashboard (`iris serve`)
6. Types `retry 429` in the search bar
7. Finds the session immediately
8. Clicks Resume
9. A terminal window opens with `claude --resume <session_id>`
