export interface Session {
  id: number;
  claude_session_id: string;
  first_prompt: string | null;
  summary: string | null;
  custom_title: string | null;
  note: string | null;
  message_count: number;
  is_sidechain: number;
  status: string;
  pinned: number;
  project_path: string | null;
  repo_name: string | null;
  git_branch: string | null;
  jsonl_path: string | null;
  started_at: string;
  last_seen_at: string;
  archived_at: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface SessionWithTags extends Session {
  tags: string[];
}

export interface Tag {
  id: number;
  name: string;
}

export interface Project {
  id: number;
  project_path: string;
  repo_name: string;
  last_seen_at: string;
}

export interface SessionEvent {
  id: number;
  session_id: number;
  event_type: string;
  payload_json: string | null;
  created_at: string;
}

export interface SessionFilter {
  q?: string;
  repo?: string;
  branch?: string;
  tag?: string;
  pinned?: boolean;
  archived?: boolean;
  sidechains?: boolean;
  limit?: number;
  offset?: number;
  sort?: "modified" | "created" | "messages";
}

export interface SessionUpsert {
  claude_session_id: string;
  first_prompt: string | null;
  summary: string | null;
  custom_title: string | null;
  message_count: number;
  is_sidechain: boolean;
  project_path: string | null;
  repo_name: string | null;
  git_branch: string | null;
  jsonl_path: string | null;
  started_at: string;
  last_seen_at: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
