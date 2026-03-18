import Table from "cli-table3";
import type { SessionWithTags, Project } from "@iris/core";

export function toRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (isNaN(then)) return "unknown";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

function getTitle(session: SessionWithTags): string {
  return (
    session.custom_title ||
    session.first_prompt ||
    "No title"
  );
}

export function formatSessionTable(sessions: SessionWithTags[]): string {
  if (sessions.length === 0) {
    return "No sessions found.";
  }

  const table = new Table({
    head: ["ID", "Title", "Repo", "Branch", "Modified", "★"],
    style: { head: [], border: [] },
    colWidths: [6, 42, 16, 16, 10, 3],
    wordWrap: true,
  });

  for (const s of sessions) {
    table.push([
      s.id,
      truncate(getTitle(s), 40),
      truncate(s.repo_name ?? "", 14),
      truncate(s.git_branch ?? "", 14),
      toRelativeTime(s.last_seen_at),
      s.pinned ? "★" : "",
    ]);
  }

  return table.toString();
}

export function formatSessionDetail(session: SessionWithTags): string {
  const lines: string[] = [];

  lines.push(`Session #${session.id}`);
  lines.push(`  Claude ID:    ${session.claude_session_id}`);
  lines.push(`  Title:        ${getTitle(session)}`);

  if (session.summary) {
    lines.push(`  Summary:      ${session.summary}`);
  }

  if (session.note) {
    lines.push(`  Note:         ${session.note}`);
  }

  lines.push(`  Repo:         ${session.repo_name ?? "—"}`);
  lines.push(`  Branch:       ${session.git_branch ?? "—"}`);
  lines.push(`  Project:      ${session.project_path ?? "—"}`);
  lines.push(`  Messages:     ${session.message_count}`);
  lines.push(`  Created:      ${session.started_at}`);
  lines.push(`  Modified:     ${session.last_seen_at}`);
  lines.push(`  Status:       ${session.status}`);
  lines.push(`  Pinned:       ${session.pinned ? "yes" : "no"}`);

  if (session.tags.length > 0) {
    lines.push(`  Tags:         ${session.tags.join(", ")}`);
  }

  return lines.join("\n");
}

export function formatProjectTable(
  projects: (Project & { session_count: number })[],
): string {
  if (projects.length === 0) {
    return "No projects found.";
  }

  const table = new Table({
    head: ["ID", "Repo", "Sessions", "Last Active"],
    style: { head: [], border: [] },
  });

  for (const p of projects) {
    table.push([
      p.id,
      p.repo_name,
      p.session_count,
      toRelativeTime(p.last_seen_at),
    ]);
  }

  return table.toString();
}
