import type { SessionRepo, SessionWithTags } from "@iris/core";
import { execSync } from "node:child_process";

export function resolveCurrentSession(
  repo: SessionRepo,
): SessionWithTags {
  // 1. Check IRIS_SESSION_ID env var
  const envSessionId = process.env["IRIS_SESSION_ID"];
  if (envSessionId) {
    const session = repo.findByClaudeId(envSessionId);
    if (session) return session;
  }

  // 2. Detect project path from cwd
  const projectPath = detectProjectPath();
  if (projectPath) {
    const session = repo.getLatestByProjectPath(projectPath);
    if (session) return session;
  }

  throw new Error(
    "Cannot determine current session. " +
      "Use a session ID instead, or run from within a project directory.",
  );
}

function detectProjectPath(): string | null {
  // Try git root first
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (root) return root;
  } catch {
    // Not a git repo
  }

  // Fall back to cwd
  return process.cwd();
}
