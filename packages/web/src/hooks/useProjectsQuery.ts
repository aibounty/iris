import { useQuery } from "@tanstack/react-query";
import { fetchProjects } from "../lib/api";

export function useProjectsQuery() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });
}
