import { useState, useRef, useEffect } from "react";

interface NoteEditorProps {
  note: string | null;
  onSave: (note: string) => void;
}

export function NoteEditor({ note, onSave }: NoteEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  function handleEdit() {
    setDraft(note ?? "");
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setDraft(note ?? "");
  }

  function handleSave() {
    onSave(draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 resize-y transition-colors"
          placeholder="Add a note..."
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-md transition-colors"
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        {note ? (
          <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {note}
          </p>
        ) : (
          <p className="text-sm text-zinc-500 italic">No note yet</p>
        )}
      </div>
      <button
        onClick={handleEdit}
        className="shrink-0 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
      >
        Edit
      </button>
    </div>
  );
}
