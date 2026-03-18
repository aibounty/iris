import type { Project } from "../lib/types";

interface SidebarProps {
  projects: Project[];
}

export function Sidebar({ projects }: SidebarProps) {
  return (
    <aside className="w-64 h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
      <div className="p-4 border-b border-zinc-800">
        <a href="/" className="text-lg font-bold text-zinc-100 tracking-tight">
          Iris
        </a>
        <p className="text-xs text-zinc-500 mt-0.5">Session Manager</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <div className="mb-6">
          <a
            href="/"
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-100 bg-zinc-800 rounded-md"
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
          {projects.length === 0 ? (
            <p className="px-3 text-xs text-zinc-600">No projects yet</p>
          ) : (
            <ul className="space-y-0.5">
              {projects.map((project) => (
                <li key={project.id}>
                  <a
                    href={`/?repo=${encodeURIComponent(project.repo_name)}`}
                    className="flex items-center justify-between px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
                  >
                    <span className="truncate">{project.repo_name}</span>
                    <span className="text-xs text-zinc-600 tabular-nums ml-2">
                      {project.session_count}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    </aside>
  );
}
