import { useQuery } from "@tanstack/react-query";
import { fetchTags } from "../lib/api";

export function useTagsQuery() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: fetchTags,
  });
}
