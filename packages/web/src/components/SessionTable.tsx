import type { Session } from "../lib/types";
import { toRelativeTime, getTitle, truncate } from "../lib/utils";

interface SessionTableProps {
  sessions: Session[];
  onResume?: (session: Session) => void;
}

export function SessionTable({ sessions, onResume }: SessionTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        No sessions found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400 text-left">
            <th className="pb-3 pr-4 font-medium">Title</th>
            <th className="pb-3 pr-4 font-medium">Repo</th>
            <th className="pb-3 pr-4 font-medium">Branch</th>
            <th className="pb-3 pr-4 font-medium">Modified</th>
            <th className="pb-3 pr-4 font-medium text-right">Msgs</th>
            <th className="pb-3 pr-4 font-medium w-8"></th>
            {onResume && <th className="pb-3 font-medium w-8"></th>}
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.id}
              className="border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors"
            >
              <td className="py-3 pr-4">
                <a
                  href={`/sessions/${session.id}`}
                  className="text-zinc-100 hover:text-white hover:underline"
                >
                  {truncate(getTitle(session), 80)}
                </a>
                {session.is_sidechain === 1 && (
                  <span className="ml-2 text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                    sidechain
                  </span>
                )}
              </td>
              <td className="py-3 pr-4 text-zinc-400">
                {session.repo_name ?? "\u2014"}
              </td>
              <td className="py-3 pr-4 text-zinc-400">
                {session.git_branch ? (
                  <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs font-mono">
                    {truncate(session.git_branch, 30)}
                  </span>
                ) : (
                  "\u2014"
                )}
              </td>
              <td className="py-3 pr-4 text-zinc-500 whitespace-nowrap">
                {toRelativeTime(session.last_seen_at)}
              </td>
              <td className="py-3 pr-4 text-zinc-400 text-right tabular-nums">
                {session.message_count}
              </td>
              <td className="py-3 pr-4 text-center">
                {session.pinned === 1 && (
                  <span title="Pinned" className="text-amber-500">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="w-3.5 h-3.5 inline-block"
                    >
                      <path d="M10.315 3.315a1.5 1.5 0 0 0-2.13 0L5.25 6.25 3.5 4.5 1.379 6.621a.75.75 0 0 0 0 1.06L5.32 11.62a.75.75 0 0 0 1.06 0L8.5 9.5l-1.75-1.75 2.935-2.935a1.5 1.5 0 0 0 0-2.13l.63.63Z" />
                      <path d="M6.5 12.5 3.5 15.5" />
                    </svg>
                  </span>
                )}
              </td>
              {onResume && (
                <td className="py-3">
                  <button
                    onClick={() => onResume(session)}
                    className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
                  >
                    Resume
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
