import { useMemo } from "react";
import type { Project } from "../lib/types";
import { navigate } from "../lib/router";

interface SidebarProps {
  projects: Project[];
  activeProjectId?: number;
}

/** For projects with duplicate repo_name, show parent dir as disambiguation. */
function buildDisplayNames(projects: Project[]): Map<number, string> {
  const nameCounts = new Map<string, number>();
  for (const p of projects) {
    nameCounts.set(p.repo_name, (nameCounts.get(p.repo_name) ?? 0) + 1);
  }

  const result = new Map<number, string>();
  for (const p of projects) {
    if ((nameCounts.get(p.repo_name) ?? 0) > 1) {
      // Show parent directory for disambiguation
      const parts = p.project_path.split("/");
      const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
      result.set(p.id, parent ? `${p.repo_name} (${parent})` : p.repo_name);
    } else {
      result.set(p.id, p.repo_name);
    }
  }
  return result;
}

export function Sidebar({ projects, activeProjectId }: SidebarProps) {
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at)),
    [projects],
  );

  const displayNames = useMemo(() => buildDisplayNames(projects), [projects]);

  const currentPath = window.location.pathname;
  const isDashboard = currentPath === "/" || currentPath === "";

  return (
    <aside className="w-64 h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
      <div className="p-4 border-b border-zinc-800">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          className="text-lg font-bold text-zinc-100 tracking-tight"
        >
          Iris
        </a>
        <p className="text-xs text-zinc-500 mt-0.5">Session Manager</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <div className="mb-6">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
              isDashboard && activeProjectId == null
                ? "text-zinc-100 bg-zinc-800"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 text-zinc-400"
            >
              <path
                fillRule="evenodd"
                d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z"
                clipRule="evenodd"
              />
            </svg>
            Dashboard
          </a>
        </div>

        <div>
          <h3 className="px-3 mb-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Projects
          </h3>
          {sortedProjects.length === 0 ? (
            <p className="px-3 text-xs text-zinc-600">No projects yet</p>
          ) : (
            <ul className="space-y-0.5">
              {sortedProjects.map((project) => {
                const isActive = activeProjectId === project.id;
                return (
                  <li key={project.id}>
                    <a
                      href={`/projects/${project.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/projects/${project.id}`);
                      }}
                      className={`flex items-center justify-between px-3 py-1.5 text-sm rounded-md transition-colors ${
                        isActive
                          ? "text-zinc-100 bg-zinc-800"
                          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                      }`}
                    >
                      <span className="truncate">{displayNames.get(project.id) ?? project.repo_name}</span>
                      <span className="text-xs text-zinc-600 tabular-nums ml-2">
                        {project.session_count}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </nav>
    </aside>
  );
}
