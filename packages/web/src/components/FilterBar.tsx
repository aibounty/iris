import { useState } from "react";
import { useTagsQuery } from "../hooks/useTagsQuery";

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
}

interface FilterBarProps {
  filters: ActiveFilter[];
  onAdd: (filter: ActiveFilter) => void;
  onRemove: (key: string) => void;
}

type FilterType = "repo" | "branch" | "tag" | "pinned";

const FILTER_OPTIONS: { type: FilterType; label: string }[] = [
  { type: "repo", label: "Repo" },
  { type: "branch", label: "Branch" },
  { type: "tag", label: "Tag" },
  { type: "pinned", label: "Pinned" },
];

export function FilterBar({ filters, onAdd, onRemove }: FilterBarProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedType, setSelectedType] = useState<FilterType | null>(null);
  const [inputValue, setInputValue] = useState("");
  const tagsQuery = useTagsQuery();

  function handleSelectType(type: FilterType) {
    if (type === "pinned") {
      onAdd({ key: "pinned", label: "Pinned", value: "true" });
      setShowDropdown(false);
      setSelectedType(null);
      return;
    }
    setSelectedType(type);
    setInputValue("");
  }

  function handleSubmit() {
    if (!selectedType || !inputValue.trim()) return;
    const label = `${selectedType}: ${inputValue.trim()}`;
    onAdd({ key: selectedType, label, value: inputValue.trim() });
    setSelectedType(null);
    setInputValue("");
    setShowDropdown(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleSubmit();
    }
    if (e.key === "Escape") {
      setSelectedType(null);
      setShowDropdown(false);
    }
  }

  // Don't show filter types that are already active (except tag which can be multiple)
  const availableTypes = FILTER_OPTIONS.filter(
    (opt) => opt.type === "tag" || !filters.some((f) => f.key === opt.type),
  );

  const tags = tagsQuery.data ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <span
          key={`${filter.key}-${filter.value}`}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-300"
        >
          {filter.label}
          <button
            onClick={() => onRemove(filter.key)}
            className="ml-0.5 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3 h-3"
            >
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </span>
      ))}

      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300 border border-dashed border-zinc-700 rounded-md hover:border-zinc-500 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-3 h-3"
          >
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
          Filter
        </button>

        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-40 min-w-[180px] overflow-hidden">
            {selectedType ? (
              <div className="p-2">
                <div className="text-xs text-zinc-500 mb-1.5 px-1 capitalize">
                  {selectedType}
                </div>
                {selectedType === "tag" && tags.length > 0 ? (
                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                    {tags.map((tag) => (
                      <button
                        key={tag.name}
                        onClick={() => {
                          onAdd({
                            key: "tag",
                            label: `tag: ${tag.name}`,
                            value: tag.name,
                          });
                          setSelectedType(null);
                          setShowDropdown(false);
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 rounded transition-colors flex justify-between"
                      >
                        <span>{tag.name}</span>
                        <span className="text-zinc-600">{tag.count}</span>
                      </button>
                    ))}
                    <div className="border-t border-zinc-800 mt-1 pt-1">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Or type a tag..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                      />
                    </div>
                  </div>
                ) : (
                  <input
                    autoFocus
                    type="text"
                    placeholder={`Enter ${selectedType}...`}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                )}
              </div>
            ) : (
              availableTypes.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => handleSelectType(opt.type)}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
