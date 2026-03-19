import type { ReactNode } from "react";
import type { Project } from "../lib/types";
import { Sidebar } from "./Sidebar";
import { SearchBar } from "./SearchBar";

interface LayoutProps {
  children: ReactNode;
  projects: Project[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeProjectId?: number;
}

export function Layout({
  children,
  projects,
  searchQuery,
  onSearchChange,
  activeProjectId,
}: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <Sidebar projects={projects} activeProjectId={activeProjectId} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-zinc-800 px-6 py-4">
          <SearchBar value={searchQuery} onChange={onSearchChange} />
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
