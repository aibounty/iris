import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSessions, fetchProjects } from "./lib/api";
import type { Session, SessionFilter } from "./lib/types";
import { Layout } from "./components/Layout";
import { SessionTable } from "./components/SessionTable";
import { SessionCard } from "./components/SessionCard";

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setDebounced(value), delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delayMs]);

  return debounced;
}

export function App() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  const filter: SessionFilter = {
    limit: 50,
    sort: "last_seen_at",
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
  };

  const sessionsQuery = useQuery({
    queryKey: ["sessions", filter],
    queryFn: () => fetchSessions(filter),
  });

  const pinnedQuery = useQuery({
    queryKey: ["sessions", "pinned"],
    queryFn: () => fetchSessions({ pinned: true, limit: 20, sort: "last_seen_at" }),
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const sessions = sessionsQuery.data?.sessions ?? [];
  const pinnedSessions = pinnedQuery.data?.sessions ?? [];
  const projects = projectsQuery.data ?? [];

  const handleResume = useCallback((session: Session) => {
    const sessionId = session.claude_session_id;
    const cmd = `claude --resume "${sessionId}"`;
    navigator.clipboard.writeText(cmd).catch(() => {});
    alert(`Copied resume command to clipboard:\n\n${cmd}`);
  }, []);

  const isLoading = sessionsQuery.isLoading;
  const isError = sessionsQuery.isError;

  return (
    <Layout
      projects={projects}
      searchQuery={searchInput}
      onSearchChange={setSearchInput}
    >
      {isError && (
        <div className="mb-6 p-4 bg-red-950/50 border border-red-900 rounded-lg text-sm text-red-300">
          Failed to load sessions. Make sure the Iris server is running.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-zinc-500 text-sm">Loading sessions...</div>
        </div>
      ) : (
        <>
          {!debouncedSearch && pinnedSessions.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-medium text-zinc-400 mb-3">
                Pinned Sessions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pinnedSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onResume={handleResume}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-sm font-medium text-zinc-400 mb-3">
              {debouncedSearch
                ? `Search results (${sessionsQuery.data?.total ?? 0})`
                : "Recent Sessions"}
            </h2>
            <SessionTable sessions={sessions} onResume={handleResume} />
          </section>
        </>
      )}
    </Layout>
  );
}
