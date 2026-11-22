import type { LucideIcon } from "lucide-react";

import type { McpToolInfo } from "../../../platform/desktopBridge";
import { cn } from "../../../shared/ui";

const EFFECT_TILE: Record<McpToolInfo["effect"], string> = {
  read: "bg-raised text-fg-muted",
  change: "bg-warn-soft text-warn",
  destructive: "bg-danger-soft text-danger",
};

/** A small rounded square holding an icon, tinted by what the tool does. */
export function EffectTile({
  icon: Icon,
  effect,
  error,
  size = "md",
}: {
  icon: LucideIcon;
  effect: McpToolInfo["effect"];
  /** Draws the tile as an error whatever the effect. */
  error?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "sm" ? "size-6 rounded-md" : "size-7 rounded-lg",
        error ? "bg-danger-soft text-danger" : EFFECT_TILE[effect],
      )}
    >
      <Icon size={size === "sm" ? 13 : 15} strokeWidth={2} />
    </span>
  );
}

/** A segmented filter, such as All / Read / Change. */
export function FilterSegments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string; count: number }>;
  onChange(next: T): void;
}) {
  return (
    <div role="group" aria-label={label} className="flex w-fit gap-0.5 rounded-md border border-line bg-canvas p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs",
            option.id === value ? "bg-raised text-fg-strong" : "text-fg-muted hover:text-fg-strong",
          )}
        >
          {option.label}
          <span className="text-[11px] text-fg-muted">{option.count}</span>
        </button>
      ))}
    </div>
  );
}
