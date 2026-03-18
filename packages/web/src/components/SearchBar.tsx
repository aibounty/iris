import { useState, useRef, useEffect } from "react";
import { useSessionsQuery } from "../hooks/useSessionsQuery";
import { toRelativeTime, getTitle, truncate } from "../lib/utils";
import { navigate } from "../lib/router";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setDebouncedQuery(value), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value]);

  const searchQuery = useSessionsQuery(
    debouncedQuery.length >= 2
      ? { q: debouncedQuery, limit: 8, sort: "last_seen_at" }
      : { limit: 0 },
  );

  const results = searchQuery.data?.sessions ?? [];
  const showDropdown = focused && debouncedQuery.length >= 2 && results.length > 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && debouncedQuery) {
      setFocused(false);
      navigate(`/?q=${encodeURIComponent(debouncedQuery)}`);
    }
    if (e.key === "Escape") {
      setFocused(false);
    }
  }

  return (
    <div ref={containerRef} className="relative max-w-xl w-full">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
          clipRule="evenodd"
        />
      </svg>
      <input
        type="text"
        placeholder="Search sessions..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-colors"
      />

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {results.map((session) => (
            <a
              key={session.id}
              href={`/sessions/${session.id}`}
              onClick={(e) => {
                e.preventDefault();
                setFocused(false);
                navigate(`/sessions/${session.id}`);
              }}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-100 truncate">
                  {truncate(getTitle(session), 60)}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                  {session.repo_name && <span>{session.repo_name}</span>}
                  {session.git_branch && (
                    <span className="font-mono">{truncate(session.git_branch, 20)}</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-zinc-600 whitespace-nowrap">
                {toRelativeTime(session.last_seen_at)}
              </span>
            </a>
          ))}
          {debouncedQuery && (
            <div
              className="px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-800 cursor-pointer transition-colors border-t border-zinc-700"
              onClick={() => {
                setFocused(false);
                navigate(`/?q=${encodeURIComponent(debouncedQuery)}`);
              }}
            >
              Press Enter for full search results
            </div>
          )}
        </div>
      )}
    </div>
  );
}
