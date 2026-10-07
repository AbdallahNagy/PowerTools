import { useEffect, useId, useMemo, useRef, useState } from "react";

import { filterSidebarItems } from "./sidebarSearch";

export interface QuickOpenTool {
  id: string;
  title: string;
  tooltip?: string;
  icon: string;
}

interface CommandPaletteProps {
  open: boolean;
  tools: readonly QuickOpenTool[];
  onClose: () => void;
  onOpen: (toolId: string) => void;
}

export default function CommandPalette({ open, tools, onClose, onOpen }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [openSession, setOpenSession] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  if (open !== openSession) {
    setOpenSession(open);
    setQuery("");
    setHighlight(0);
  }
  const results = useMemo(() => filterSidebarItems(tools, query), [query, tools]);
  const selectedIndex =
    results.length === 0 ? 0 : Math.min(highlight, results.length - 1);
  const selected = results[selectedIndex];
  const activeOptionId = selected ? `${listId}-${selected.id}` : undefined;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeOptionId, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const openSelected = () => {
    if (!selected) return;
    onOpen(selected.id);
  };

  const moveHighlight = (next: number) => {
    if (results.length === 0) return;
    const clamped = Math.max(0, Math.min(next, results.length - 1));
    setHighlight(clamped);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 p-6"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label="Open tool"
        className="mx-auto mt-12 flex w-full max-w-lg flex-col overflow-hidden rounded-sm border border-line bg-surface shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-label="Open tool"
          value={query}
          placeholder="Type a tool name"
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveHighlight(selectedIndex + 1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveHighlight(selectedIndex - 1);
            } else if (event.key === "Home") {
              event.preventDefault();
              moveHighlight(0);
            } else if (event.key === "End") {
              event.preventDefault();
              moveHighlight(results.length - 1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              openSelected();
            }
          }}
          className="w-full border-b border-line bg-raised px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Tools"
          className="max-h-80 overflow-auto py-1"
        >
          {results.map((tool, index) => {
            const active = index === selectedIndex;
            return (
              <li
                key={tool.id}
                id={`${listId}-${tool.id}`}
                role="option"
                aria-selected={active}
                className={`flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden px-3 py-1.5 text-sm ${
                  active
                    ? "bg-hover text-fg-strong"
                    : "text-fg"
                }`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onOpen(tool.id);
                }}
              >
                <img
                  src={tool.icon}
                  alt=""
                  className="h-5 w-5 brightness-0 invert opacity-80"
                />
                <span className="min-w-0 truncate">{tool.title}</span>
                {tool.tooltip && tool.tooltip !== tool.title ? (
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
                    {tool.tooltip}
                  </span>
                ) : null}
              </li>
            );
          })}
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">
              No matching tools
            </li>
          ) : null}
        </ul>
        <p className="border-t border-line px-3 py-1.5 text-xs text-fg-muted">
          Enter to open · Esc to close
        </p>
      </div>
    </div>
  );
}
