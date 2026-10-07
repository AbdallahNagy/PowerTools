import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** One collapsible step of the picker: solution, table, lookup, attributes. */
export function PickerStep({
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  summary: string | null;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={expanded ? "flex min-h-0 flex-1 flex-col gap-2" : "shrink-0"}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={summary ? `${title}, ${summary}` : title}
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-sm border border-line bg-raised px-3 py-2 text-left hover:bg-hover"
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-fg-muted ${expanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        <span className="text-sm text-fg-strong">{title}</span>
        {summary ? (
          <span className="truncate text-xs text-fg-muted">{summary}</span>
        ) : null}
      </button>
      {expanded ? <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">{children}</div> : null}
    </div>
  );
}
