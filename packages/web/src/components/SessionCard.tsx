import type { Session } from "../lib/types";
import { toRelativeTime, getTitle, truncate } from "../lib/utils";
import { navigate } from "../lib/router";

interface SessionCardProps {
  session: Session;
  onResume?: (session: Session) => void;
}

export function SessionCard({ session, onResume }: SessionCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <a
          href={`/sessions/${session.id}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/sessions/${session.id}`);
          }}
          className="text-sm font-medium text-zinc-100 hover:text-white hover:underline leading-snug"
        >
          {truncate(getTitle(session), 60)}
        </a>
        {session.pinned === 1 && (
          <span className="text-amber-500 shrink-0" title="Pinned">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path d="M10.315 3.315a1.5 1.5 0 0 0-2.13 0L5.25 6.25 3.5 4.5 1.379 6.621a.75.75 0 0 0 0 1.06L5.32 11.62a.75.75 0 0 0 1.06 0L8.5 9.5l-1.75-1.75 2.935-2.935a1.5 1.5 0 0 0 0-2.13l.63.63Z" />
              <path d="M6.5 12.5 3.5 15.5" />
            </svg>
          </span>
        )}
      </div>

      {session.note && (
        <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
          {truncate(session.note, 120)}
        </p>
      )}

      <div className="flex items-center gap-3 text-xs text-zinc-500 mb-3">
        {session.repo_name && (
          <span>{session.repo_name}</span>
        )}
        {session.git_branch && (
          <span className="bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
            {truncate(session.git_branch, 20)}
          </span>
        )}
        <span>{toRelativeTime(session.last_seen_at)}</span>
        <span>{session.message_count} msgs</span>
      </div>

      {onResume && (
        <button
          onClick={() => onResume(session)}
          className="text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded transition-colors"
        >
          Resume
        </button>
      )}
    </div>
  );
}
