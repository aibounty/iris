import { describe, it, expect } from "vitest";
import { formatPickerItem } from "../commands/pick.js";
import type { SessionWithTags } from "@iris/core";

function makeSession(
  overrides: Partial<SessionWithTags> = {},
): SessionWithTags {
  return {
    id: 1,
    claude_session_id: "test-123",
    first_prompt: "Fix the bug",
    summary: "Summary",
    custom_title: null,
    note: null,
    message_count: 10,
    is_sidechain: 0,
    status: "active",
    pinned: 0,
    project_path: "/home/user/myproject",
    repo_name: "myproject",
    git_branch: "main",
    jsonl_path: null,
    started_at: "2025-03-15T10:00:00.000Z",
    last_seen_at: "2025-03-15T12:00:00.000Z",
    archived_at: null,
    source: "passive",
    created_at: "2025-03-15T10:00:00.000Z",
    updated_at: "2025-03-15T12:00:00.000Z",
    tags: [],
    ...overrides,
  };
}

describe("formatPickerItem", () => {
  it("formats with all fields", () => {
    const item = formatPickerItem(
      makeSession({
        repo_name: "myrepo",
        first_prompt: "Fix auth",
        git_branch: "feature/auth",
      }),
    );
    expect(item).toContain("[myrepo]");
    expect(item).toContain("Fix auth");
    expect(item).toContain("feature/auth");
  });

  it("prefers custom_title over first_prompt", () => {
    const item = formatPickerItem(
      makeSession({
        custom_title: "My Custom Title",
        first_prompt: "Some prompt",
      }),
    );
    expect(item).toContain("My Custom Title");
    expect(item).not.toContain("Some prompt");
  });

  it("shows pin indicator for pinned sessions", () => {
    const pinned = formatPickerItem(makeSession({ pinned: 1 }));
    expect(pinned).toContain("★");

    const unpinned = formatPickerItem(makeSession({ pinned: 0 }));
    expect(unpinned).not.toContain("★");
  });
});
