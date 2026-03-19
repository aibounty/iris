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
  tags: string[];
}

export interface Project {
  id: number;
  project_path: string;
  repo_name: string;
  last_seen_at: string;
  session_count: number;
}

export interface Tag {
  id: number;
  name: string;
  count: number;
}

export interface SessionFilter {
  q?: string;
  repo?: string;
  project_path?: string;
  branch?: string;
  tag?: string;
  pinned?: boolean;
  archived?: boolean;
  limit?: number;
  offset?: number;
  sort?: string;
}

export interface PaginatedSessions {
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
}
