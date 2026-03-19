import { useState, useEffect, useCallback, useMemo } from "react";
import { resumeSession } from "./lib/api";
import { parseQueryParams, navigate } from "./lib/router";
import { useSessionsQuery } from "./hooks/useSessionsQuery";
import { useProjectsQuery } from "./hooks/useProjectsQuery";
import type { Session, SessionFilter } from "./lib/types";
import { Layout } from "./components/Layout";
import { FilterBar } from "./components/FilterBar";
import type { ActiveFilter } from "./components/FilterBar";
import { SessionTable } from "./components/SessionTable";
import { SessionCard } from "./components/SessionCard";
import { ToastProvider } from "./components/Toast";
import { SessionDetailPage } from "./pages/SessionDetailPage";
import { ProjectPage } from "./pages/ProjectPage";

type Route =
  | { page: "dashboard" }
  | { page: "session"; id: number }
  | { page: "project"; repoName: string };

function parseRoute(): Route {
  const path = window.location.pathname;

  const sessionMatch = path.match(/^\/sessions\/(\d+)$/);
  if (sessionMatch) {
    return { page: "session", id: parseInt(sessionMatch[1], 10) };
  }

  const projectMatch = path.match(/^\/projects\/(.+)$/);
  if (projectMatch) {
    return { page: "project", repoName: decodeURIComponent(projectMatch[1]) };
  }

  return { page: "dashboard" };
}

function filtersFromUrl(): ActiveFilter[] {
  const params = parseQueryParams();
  const filters: ActiveFilter[] = [];
  if (params.repo) filters.push({ key: "repo", label: `repo: ${params.repo}`, value: params.repo });
  if (params.branch) filters.push({ key: "branch", label: `branch: ${params.branch}`, value: params.branch });
  if (params.tag) filters.push({ key: "tag", label: `tag: ${params.tag}`, value: params.tag });
  if (params.pinned) filters.push({ key: "pinned", label: "Pinned", value: "true" });
  return filters;
}

function filtersToUrl(filters: ActiveFilter[], searchQuery: string): string {
  const params = new URLSearchParams();
  for (const f of filters) {
    params.set(f.key, f.value);
  }
  if (searchQuery) params.set("q", searchQuery);
  const qs = params.toString();
  return `/${qs ? `?${qs}` : ""}`;
}

function Dashboard() {
  const [searchInput, setSearchInput] = useState(() => {
    return parseQueryParams().q ?? "";
  });
  const [filters, setFilters] = useState<ActiveFilter[]>(filtersFromUrl);

  // Sync URL to state on popstate
  useEffect(() => {
    function onPop() {
      const params = parseQueryParams();
      setSearchInput(params.q ?? "");
      setFilters(filtersFromUrl());
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Build filter for API call
  const apiFilter: SessionFilter = useMemo(() => {
    const f: SessionFilter = { limit: 50, sort: "last_seen_at" };
    if (searchInput) f.q = searchInput;
    for (const af of filters) {
      if (af.key === "repo") f.repo = af.value;
      if (af.key === "branch") f.branch = af.value;
      if (af.key === "tag") f.tag = af.value;
      if (af.key === "pinned") f.pinned = true;
    }
    return f;
  }, [searchInput, filters]);

  const sessionsQuery = useSessionsQuery(apiFilter);

  const hasFilters = filters.length > 0 || !!searchInput;

  const pinnedQuery = useSessionsQuery(
    hasFilters
      ? { limit: 0 } // Don't fetch pinned when filtering
      : { pinned: true, limit: 20, sort: "last_seen_at" },
  );

  const sessions = sessionsQuery.data?.sessions ?? [];
  const pinnedSessions = pinnedQuery.data?.sessions ?? [];

  const handleResume = useCallback(async (session: Session) => {
    try {
      const result = await resumeSession(session.id);
      // Session opened in terminal successfully
      console.log(`Session resumed in ${result.terminal}`);
    } catch {
      // Fallback: copy command to clipboard
      const cmd = `claude --resume "${session.claude_session_id}"`;
      navigator.clipboard.writeText(cmd).catch(() => {});
      alert(`Copied resume command to clipboard:\n\n${cmd}`);
    }
  }, []);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    // Update URL with debounce handled by the search query itself
    const url = filtersToUrl(filters, value);
    window.history.replaceState(null, "", url);
  }

  function handleAddFilter(filter: ActiveFilter) {
    const next = [...filters.filter((f) => f.key !== filter.key || f.key === "tag"), filter];
    setFilters(next);
    const url = filtersToUrl(next, searchInput);
    window.history.pushState(null, "", url);
  }

  function handleRemoveFilter(key: string) {
    const next = filters.filter((f) => f.key !== key);
    setFilters(next);
    const url = filtersToUrl(next, searchInput);
    window.history.pushState(null, "", url);
  }

  const isLoading = sessionsQuery.isLoading;
  const isError = sessionsQuery.isError;

  return (
    <>
      {isError && (
        <div className="mb-6 p-4 bg-red-950/50 border border-red-900 rounded-lg text-sm text-red-300">
          Failed to load sessions. Make sure the Iris server is running.
        </div>
      )}

      <div className="mb-4">
        <FilterBar
          filters={filters}
          onAdd={handleAddFilter}
          onRemove={handleRemoveFilter}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-zinc-500 text-sm">Loading sessions...</div>
        </div>
      ) : (
        <>
          {!hasFilters && pinnedSessions.length > 0 && (
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
              {hasFilters
                ? `Results (${sessionsQuery.data?.total ?? 0})`
                : "Recent Sessions"}
            </h2>
            <SessionTable sessions={sessions} onResume={handleResume} />
            {(sessionsQuery.data?.total ?? 0) > sessions.length && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => {
                    // Load more by increasing limit — simple approach
                    // For a real pagination, we'd track offset
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Showing {sessions.length} of {sessionsQuery.data?.total}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function AppContent() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [searchQuery, setSearchQuery] = useState(() => parseQueryParams().q ?? "");
  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data ?? [];

  useEffect(() => {
    function handlePopState() {
      setRoute(parseRoute());
      setSearchQuery(parseQueryParams().q ?? "");
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activeRepo = route.page === "project" ? route.repoName : undefined;

  return (
    <Layout
      projects={projects}
      searchQuery={searchQuery}
      onSearchChange={(val) => {
        setSearchQuery(val);
        if (route.page !== "dashboard") {
          navigate(`/?q=${encodeURIComponent(val)}`);
        }
      }}
      activeRepo={activeRepo}
    >
      {route.page === "session" ? (
        <SessionDetailPage sessionId={route.id} />
      ) : route.page === "project" ? (
        <ProjectPage repoName={route.repoName} />
      ) : (
        <Dashboard />
      )}
    </Layout>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
