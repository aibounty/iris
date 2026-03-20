# Iris

A session manager for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Browse, search, organize, and resume your coding sessions from a web dashboard or the terminal.

Iris reads Claude Code's local data files directly — no cloud sync, no API keys, everything stays on your machine.

## What it does

- **Discovers all sessions** by scanning JSONL files in `~/.claude/projects/`, not just the ones Claude Code indexes
- **Web dashboard** at `localhost:4269` with search, filters, pinned sessions, and one-click resume
- **CLI** for quick access: list, search, pick, resume, tag, pin, archive
- **Stays in sync** with background polling that detects new and changed sessions automatically

## Quick start

```bash
git clone https://github.com/anthropics/iris.git
cd iris
npm install
npm run build
npm start
```

This starts the web server at `http://localhost:4269` and opens the dashboard in your browser.

## CLI usage

The CLI is available as `node packages/cli/dist/bin.js` (or `iris` if linked globally).

```bash
# Start the web dashboard
iris serve

# List recent sessions
iris list
iris list --repo my-project --branch main

# Search across all sessions
iris search "auth bug"

# Interactive fuzzy picker → resume in terminal
iris pick

# Resume the most recent session
iris last

# Resume a specific session
iris open 42
iris resume <claude-session-id>

# Organize
iris pin 42
iris tag add 42 important
iris note 42 "stopped at retry logic"
iris archive 42

# Force re-index
iris scan

# Show config
iris config
```

## Web dashboard

The dashboard provides:

- **Pinned sessions** grid at the top for quick access
- **Session table** with repo, branch, status, message count, and timestamps
- **Full-text search** across prompts, summaries, notes, repo names, and branches
- **Filters** by repository, branch, tag, pinned/archived status
- **Session detail page** with metadata, note editor, tag management, and resume button
- **Project view** grouping sessions by project

## REST API

The server exposes a REST API at `/api`:

| Endpoint | Description |
|---|---|
| `GET /api/sessions` | List/search sessions (query params: `q`, `repo`, `branch`, `tag`, `pinned`, `limit`, `offset`) |
| `GET /api/sessions/:id` | Get session details |
| `POST /api/sessions/:id/note` | Update note |
| `POST /api/sessions/:id/pin` | Toggle pin |
| `POST /api/sessions/:id/archive` | Toggle archive |
| `POST /api/sessions/:id/tags` | Add/remove tags |
| `POST /api/sessions/:id/resume` | Resume in terminal |
| `GET /api/projects` | List projects with session counts |
| `GET /api/tags` | List tags with usage counts |
| `GET /api/health` | Server status |

Mutation endpoints require a Bearer token (auto-generated, shown in `iris config`).

## How indexing works

Iris scans `~/.claude/projects/*/` for `.jsonl` session files (excluding `agent-*.jsonl` sub-sessions). For each file it extracts:

- Session ID, project path, git branch
- First user prompt and message count
- Timestamps (first and last message)
- Sidechain status

Summary and custom title fields are enriched from Claude Code's `sessions-index.json` where available, but discovery doesn't depend on it.

On subsequent scans, files with unchanged modification times are skipped. Empty sessions (0 messages, no user-added notes/tags/pins) are automatically pruned.

## Configuration

Config file: `~/.config/iris/config.toml`

```toml
[server]
host = "127.0.0.1"
port = 4269

[terminal]
preferred = "auto"  # auto | iterm | terminal_app | kitty | shell

[indexer]
poll_interval_ms = 30000
claude_data_dir = "~/.claude"

[ui]
open_browser = true

[security]
readonly = false
```

## Terminal support

Iris can resume sessions in:

- **iTerm2** (macOS)
- **Terminal.app** (macOS)
- **Kitty** (cross-platform)
- **System terminal** (fallback)

Auto-detection picks the best available option. Override with `--terminal` flag or the config file.

## Project structure

```
packages/
  core/     Database, indexer, parser, repos (SQLite + better-sqlite3)
  cli/      Command-line interface (Commander.js)
  server/   REST API (Fastify)
  web/      Dashboard (React, TanStack Router, Tailwind CSS)
```

## Development

```bash
# Build everything
npm run build

# Run tests
npm test

# Dev mode (web)
npm run dev:web

# Dev mode (server with auto-reload)
npm run dev:server
```

Requires Node.js 20+.

## License

MIT
