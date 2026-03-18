import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchSession,
  updateNote,
  updatePin,
  updateArchive,
  updateTags,
  resumeSession,
} from "../lib/api";
import { SessionDetail } from "../components/SessionDetail";
import { useToast } from "../components/Toast";

interface SessionDetailPageProps {
  sessionId: number;
}

export function SessionDetailPage({ sessionId }: SessionDetailPageProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const sessionQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => fetchSession(sessionId),
  });

  function invalidateSession() {
    queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
  }

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) => updatePin(sessionId, pinned),
    onSuccess: (updated) => {
      showToast(updated.pinned === 1 ? "Session pinned" : "Session unpinned", "success");
      invalidateSession();
    },
    onError: () => showToast("Failed to update pin status", "error"),
  });

  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) => updateArchive(sessionId, archived),
    onSuccess: (updated) => {
      showToast(updated.archived_at ? "Session archived" : "Session unarchived", "success");
      invalidateSession();
    },
    onError: () => showToast("Failed to update archive status", "error"),
  });

  const noteMutation = useMutation({
    mutationFn: (note: string) => updateNote(sessionId, note),
    onSuccess: () => {
      showToast("Note saved", "success");
      invalidateSession();
    },
    onError: () => showToast("Failed to save note", "error"),
  });

  const addTagMutation = useMutation({
    mutationFn: (tag: string) => updateTags(sessionId, [tag], undefined),
    onSuccess: () => {
      showToast("Tag added", "success");
      invalidateSession();
    },
    onError: () => showToast("Failed to add tag", "error"),
  });

  const removeTagMutation = useMutation({
    mutationFn: (tag: string) => updateTags(sessionId, undefined, [tag]),
    onSuccess: () => {
      showToast("Tag removed", "success");
      invalidateSession();
    },
    onError: () => showToast("Failed to remove tag", "error"),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeSession(sessionId),
    onSuccess: (data) => {
      showToast(`Session resumed in ${data.terminal}`, "success");
    },
    onError: () => {
      // Fallback: copy command to clipboard
      if (sessionQuery.data) {
        const cmd = `claude --resume "${sessionQuery.data.claude_session_id}"`;
        navigator.clipboard.writeText(cmd).catch(() => {});
        showToast("Copied resume command to clipboard", "success");
      } else {
        showToast("Failed to resume session", "error");
      }
    },
  });

  if (sessionQuery.isLoading) {
    return (
      <div className="max-w-4xl space-y-6 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="h-6 bg-zinc-800 rounded w-3/4" />
            <div className="h-4 bg-zinc-800 rounded w-1/4" />
          </div>
          <div className="h-10 bg-zinc-800 rounded w-32" />
        </div>
        {/* Info grid skeleton */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
          <div className="h-4 bg-zinc-800 rounded w-20" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-zinc-800 rounded w-16" />
                <div className="h-4 bg-zinc-800 rounded w-40" />
              </div>
            ))}
          </div>
        </div>
        {/* Note skeleton */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-3">
          <div className="h-4 bg-zinc-800 rounded w-12" />
          <div className="h-10 bg-zinc-800 rounded w-full" />
        </div>
      </div>
    );
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <div className="max-w-4xl">
        <div className="bg-red-950/50 border border-red-900 rounded-lg p-6 text-center">
          <p className="text-red-300 text-sm mb-4">
            {sessionQuery.error instanceof Error
              ? sessionQuery.error.message
              : "Session not found"}
          </p>
          <a
            href="/"
            className="text-sm text-zinc-400 hover:text-zinc-200 underline transition-colors"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const session = sessionQuery.data;

  return (
    <div>
      <div className="mb-4">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
              clipRule="evenodd"
            />
          </svg>
          Back to Dashboard
        </a>
      </div>

      <SessionDetail
        session={session}
        onTogglePin={() => pinMutation.mutate(session.pinned !== 1)}
        onToggleArchive={() => archiveMutation.mutate(!session.archived_at)}
        onSaveNote={(note) => noteMutation.mutate(note)}
        onAddTag={(tag) => addTagMutation.mutate(tag)}
        onRemoveTag={(tag) => removeTagMutation.mutate(tag)}
        onResume={() => resumeMutation.mutate()}
      />
    </div>
  );
}
