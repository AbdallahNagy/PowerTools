import { MessageSquarePlus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { filterSidebarItems } from "./sidebarSearch";
import { ToolIcon } from "./ToolIcon";

export interface QuickOpenTool {
  id: string;
  title: string;
  tooltip?: string;
  icon: string;
}

/** A command listed after the tools, such as switching connection. */
export interface PaletteCommand {
  id: string;
  title: string;
  /** Second line of text; searched together with the title. */
  tooltip?: string;
  icon: ReactNode;
  /** Short label on the right, such as PROD. */
  badge?: ReactNode;
  onRun: () => void;
}

export interface PaletteSection {
  id: string;
  label: string;
  commands: readonly PaletteCommand[];
}

interface CommandPaletteProps {
  open: boolean;
  tools: readonly QuickOpenTool[];
  /** More groups of commands, listed after the tools. */
  sections?: readonly PaletteSection[];
  onClose: () => void;
  onOpen: (toolId: string) => void;
  /** Adds a last option that asks for a new tool, named after the query. */
  onRequestTool?: (query: string) => void;
}

type Option =
  | { kind: "tool"; key: string; tool: QuickOpenTool }
  | { kind: "command"; key: string; command: PaletteCommand }
  | { kind: "request"; key: string };

export default function CommandPalette({
  open,
  tools,
  sections = [],
  onClose,
  onOpen,
  onRequestTool,
}: CommandPaletteProps) {
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

  const groups = useMemo(() => {
    const toolResults = filterSidebarItems(tools, query);
    const result: { id: string; label: string; options: Option[] }[] = [
      {
        id: "tools",
        label: "Tools",
        options: toolResults.map((tool) => ({ kind: "tool" as const, key: `tool-${tool.id}`, tool })),
      },
    ];
    for (const section of sections) {
      result.push({
        id: section.id,
        label: section.label,
        options: filterSidebarItems(section.commands, query).map((command) => ({
          kind: "command" as const,
          key: `${section.id}-${command.id}`,
          command,
        })),
      });
    }
    return result.filter((group) => group.options.length > 0);
  }, [query, sections, tools]);

  // The request option, when shown, sits after every result in the highlight order.
  const options: Option[] = [
    ...groups.flatMap((group) => group.options),
    ...(onRequestTool ? [{ kind: "request" as const, key: "request-tool" }] : []),
  ];
  const resultCount = options.length - (onRequestTool ? 1 : 0);
  const selectedIndex = options.length === 0 ? 0 : Math.min(highlight, options.length - 1);
  const selected = options[selectedIndex];
  const optionId = (option: Option) => `${listId}-${option.key}`;
  const activeOptionId = selected ? optionId(selected) : undefined;
  const trimmedQuery = query.trim();
  const showHeadings = groups.length > 1;

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

  const run = (option: Option | undefined) => {
    if (!option) return;
    if (option.kind === "tool") onOpen(option.tool.id);
    else if (option.kind === "command") option.command.onRun();
    else onRequestTool?.(trimmedQuery);
  };

  const moveHighlight = (next: number) => {
    if (options.length === 0) return;
    const clamped = Math.max(0, Math.min(next, options.length - 1));
    setHighlight(clamped);
  };

  const renderOption = (option: Option) => {
    const index = options.indexOf(option);
    const active = index === selectedIndex;
    const common = {
      id: optionId(option),
      role: "option" as const,
      "aria-selected": active,
      onMouseEnter: () => setHighlight(index),
      onMouseDown: (event: React.MouseEvent) => {
        event.preventDefault();
        run(option);
      },
    };
    const rowClass = `flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden px-3 py-1.5 text-sm ${
      active ? "bg-hover text-fg-strong" : "text-fg"
    }`;

    if (option.kind === "tool") {
      const { tool } = option;
      return (
        <li key={option.key} {...common} className={rowClass}>
          <ToolIcon src={tool.icon} />
          <span className="min-w-0 truncate">{tool.title}</span>
          {tool.tooltip && tool.tooltip !== tool.title ? (
            <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
              {tool.tooltip}
            </span>
          ) : null}
        </li>
      );
    }
    if (option.kind === "command") {
      const { command } = option;
      return (
        <li key={option.key} {...common} className={rowClass}>
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center opacity-80">
            {command.icon}
          </span>
          <span className="min-w-0 truncate">{command.title}</span>
          {command.tooltip && command.tooltip !== command.title ? (
            <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
              {command.tooltip}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          {command.badge}
        </li>
      );
    }
    return (
      <li
        key={option.key}
        {...common}
        className={`flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden border-t border-line px-3 py-1.5 text-sm ${
          active ? "bg-hover text-fg-strong" : "text-fg-muted"
        }`}
      >
        <MessageSquarePlus size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 truncate">
          {trimmedQuery ? `Request "${trimmedQuery}" as a new tool…` : "Request a new tool…"}
        </span>
      </li>
    );
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
          placeholder={sections.length > 0 ? "Type a tool, connection or command" : "Type a tool name"}
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
              moveHighlight(options.length - 1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(selected);
            }
          }}
          className="w-full border-b border-line bg-raised px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
        />
        <ul
          id={listId}
          role="listbox"
          aria-label={sections.length > 0 ? "Results" : "Tools"}
          className="max-h-80 overflow-auto py-1"
        >
          {groups.map((group) =>
            showHeadings ? (
              <li key={group.id} role="presentation">
                <div className="px-3 pb-0.5 pt-1.5 text-xs font-medium text-fg-muted" aria-hidden="true">
                  {group.label}
                </div>
                <ul role="group" aria-label={group.label}>
                  {group.options.map(renderOption)}
                </ul>
              </li>
            ) : (
              group.options.map(renderOption)
            ),
          )}
          {resultCount === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">
              {sections.length > 0 ? "No matches" : "No matching tools"}
            </li>
          ) : null}
          {onRequestTool ? renderOption(options[options.length - 1]) : null}
        </ul>
        <p className="border-t border-line px-3 py-1.5 text-xs text-fg-muted">
          Enter to open · Esc to close
        </p>
      </div>
    </div>
  );
}
