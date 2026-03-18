import { useQuery } from "@tanstack/react-query";
import { fetchSessions } from "../lib/api";
import type { SessionFilter } from "../lib/types";

export function useSessionsQuery(filter: SessionFilter) {
  return useQuery({
    queryKey: ["sessions", filter],
    queryFn: () => fetchSessions(filter),
  });
}
