import type { ReactNode } from "react";
import { cn } from "./cn";

interface ToolbarProps {
  children: ReactNode;
  /** Content pinned to the right, usually the primary action. */
  end?: ReactNode;
  "aria-label"?: string;
  className?: string;
}

/** Row of controls at the top of a tool or panel. */
export function Toolbar({ children, end, className, "aria-label": ariaLabel }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn("flex items-center gap-2 border-b border-line bg-surface px-3 py-2", className)}
    >
      <div className="flex flex-1 min-w-0 items-center gap-2">{children}</div>
      {end ? <div className="flex shrink-0 items-center gap-2">{end}</div> : null}
    </div>
  );
}
