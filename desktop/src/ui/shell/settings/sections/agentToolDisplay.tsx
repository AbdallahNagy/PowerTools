import type { McpToolInfo } from "../../../platform/desktopBridge";
import { cn } from "../../../shared/ui";

/**
 * A small outlined word saying what a tool does to the environment, or that a call failed.
 * Reads tag nothing: most tools only read, and a tag on every row would be noise.
 */
export function EffectTag({ effect, error }: { effect: McpToolInfo["effect"]; error?: string }) {
  const text = error ?? (effect === "destructive" ? "Destructive" : effect === "change" ? "Change" : null);
  if (!text) return null;
  const tone = error || effect === "destructive" ? "danger" : "neutral";
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border px-1.5 text-2xs font-normal",
        tone === "danger" ? "border-danger/45 text-danger" : "border-line-strong text-fg-muted",
      )}
    >
      {text}
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
