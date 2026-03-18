import type { Session } from "../lib/types";
import { toRelativeTime, getTitle } from "../lib/utils";
import { NoteEditor } from "./NoteEditor";
import { TagEditor } from "./TagEditor";

interface SessionDetailProps {
  session: Session;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onSaveNote: (note: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onResume: () => void;
}

export function SessionDetail({
  session,
  onTogglePin,
  onToggleArchive,
  onSaveNote,
  onAddTag,
  onRemoveTag,
  onResume,
}: SessionDetailProps) {
  const isPinned = session.pinned === 1;
  const isArchived = !!session.archived_at;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-zinc-100 leading-snug">
            {getTitle(session)}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                session.status === "active"
                  ? "bg-emerald-900/50 text-emerald-300 border border-emerald-800"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700"
              }`}
            >
              {session.status}
            </span>
            {session.is_sidechain === 1 && (
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                sidechain
              </span>
            )}
            {isArchived && (
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">
                archived
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Pin button */}
          <button
            onClick={onTogglePin}
            title={isPinned ? "Unpin session" : "Pin session"}
            className={`p-2 rounded-md transition-colors ${
              isPinned
                ? "text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {isPinned ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path
                  fillRule="evenodd"
                  d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
                />
              </svg>
            )}
          </button>

          {/* Archive button */}
          <button
            onClick={onToggleArchive}
            title={isArchived ? "Unarchive session" : "Archive session"}
            className={`p-2 rounded-md transition-colors ${
              isArchived
                ? "text-zinc-300 hover:text-zinc-100 bg-zinc-700 hover:bg-zinc-600"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
              />
            </svg>
          </button>

          {/* Resume button */}
          <button
            onClick={onResume}
            className="ml-2 px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors"
          >
            Resume Session
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label="Claude ID" value={session.claude_session_id} mono />
          <InfoRow label="Status" value={session.status} />
          <InfoRow label="Repository" value={session.repo_name ?? "\u2014"} />
          <InfoRow label="Branch" value={session.git_branch ?? "\u2014"} mono={!!session.git_branch} />
          <InfoRow label="Project Path" value={session.project_path ?? "\u2014"} mono={!!session.project_path} />
          <InfoRow label="Messages" value={String(session.message_count)} />
          <InfoRow label="Created" value={formatDate(session.started_at)} />
          <InfoRow label="Last Modified" value={`${formatDate(session.last_seen_at)} (${toRelativeTime(session.last_seen_at)})`} />
        </div>
      </div>

      {/* Summary */}
      {session.summary && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Summary</h2>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {session.summary}
          </p>
        </div>
      )}

      {/* Note */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Note</h2>
        <NoteEditor note={session.note} onSave={onSaveNote} />
      </div>

      {/* Tags */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Tags</h2>
        <TagEditor
          tags={session.tags ?? []}
          onAdd={onAddTag}
          onRemove={onRemoveTag}
        />
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-zinc-500">{label}</span>
      <span
        className={`text-zinc-200 truncate ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
