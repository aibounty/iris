import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionsQuery } from "../hooks/useSessionsQuery";
import { fetchProject, resumeSession } from "../lib/api";
import { SessionTable } from "../components/SessionTable";
import type { Session } from "../lib/types";

interface ProjectPageProps {
  projectId: number;
}

export function ProjectPage({ projectId }: ProjectPageProps) {
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId),
  });

  const project = projectQuery.data;

  const sessionsQuery = useSessionsQuery(
    project
      ? { project_path: project.project_path, limit: 200, sort: "last_seen_at" }
      : { limit: 0 },
  );

  const sessions = sessionsQuery.data?.sessions ?? [];

  // Group sessions by branch
  const branchGroups = useMemo(() => {
    const groups: Record<string, Session[]> = {};
    for (const session of sessions) {
      const branch = session.git_branch || "(no branch)";
      if (!groups[branch]) groups[branch] = [];
      groups[branch].push(session);
    }
    // Sort branch groups: most recently modified first
    return Object.entries(groups).sort((a, b) => {
      const aLatest = a[1][0]?.last_seen_at ?? "";
      const bLatest = b[1][0]?.last_seen_at ?? "";
      return bLatest.localeCompare(aLatest);
    });
  }, [sessions]);

  const handleResume = useCallback(async (session: Session) => {
    try {
      const result = await resumeSession(session.id);
      console.log(`Session resumed in ${result.terminal}`);
    } catch {
      const cmd = `claude --resume "${session.claude_session_id}"`;
      navigator.clipboard.writeText(cmd).catch(() => {});
      alert(`Copied resume command to clipboard:\n\n${cmd}`);
    }
  }, []);

  if (projectQuery.isLoading || sessionsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 text-sm">Loading sessions...</div>
      </div>
    );
  }

  if (projectQuery.isError) {
    return (
      <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-sm text-red-300">
        Failed to load project.
      </div>
    );
  }

  if (sessionsQuery.isError) {
    return (
      <div className="p-4 bg-red-950/50 border border-red-900 rounded-lg text-sm text-red-300">
        Failed to load sessions for this project.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">{project?.repo_name}</h1>
        <p className="text-xs text-zinc-600 font-mono mt-0.5">{project?.project_path}</p>
        <p className="text-sm text-zinc-500 mt-1">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} across{" "}
          {branchGroups.length} branch{branchGroups.length !== 1 ? "es" : ""}
        </p>
      </div>

      {branchGroups.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">
          No sessions found for this project.
        </div>
      ) : (
        <div className="space-y-8">
          {branchGroups.map(([branch, branchSessions]) => (
            <section key={branch}>
              <div className="flex items-center gap-2 mb-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="w-4 h-4 text-zinc-500"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.75 2a.75.75 0 0 1 .75.75v2.315a3.001 3.001 0 0 1 1.88 1.672l2.428-.804A2.995 2.995 0 0 1 12.75 4a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-.75.75 3.001 3.001 0 0 1-2.942-2.433l-2.428.804A3.001 3.001 0 0 1 5.5 11.065v2.185a.75.75 0 0 1-1.5 0V2.75A.75.75 0 0 1 4.75 2Z"
                    clipRule="evenodd"
                  />
                </svg>
                <h2 className="text-sm font-medium text-zinc-300">
                  <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded">
                    {branch}
                  </span>
                </h2>
                <span className="text-xs text-zinc-600">
                  ({branchSessions.length})
                </span>
              </div>
              <SessionTable sessions={branchSessions} onResume={handleResume} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
