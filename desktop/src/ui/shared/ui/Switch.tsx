import { cn } from "./cn";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

const SIZES = {
  md: { track: "h-5 w-9", thumb: "h-3.5 w-3.5", on: "translate-x-4", off: "translate-x-0.5" },
  sm: { track: "h-4 w-7", thumb: "h-2.5 w-2.5", on: "translate-x-3.5", off: "translate-x-0.5" },
} as const;

/** An on/off setting that applies at once. Use Checkbox for picking items from a list. */
export function Switch({
  checked,
  onChange,
  disabled,
  size = "md",
  id,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: SwitchProps) {
  const s = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full border transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-accent bg-accent enabled:hover:border-accent-hover enabled:hover:bg-accent-hover"
          : "border-line-strong bg-raised enabled:hover:bg-hover",
        s.track,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block rounded-full transition-transform",
          checked ? "bg-accent-fg" : "bg-fg-muted",
          s.thumb,
          checked ? s.on : s.off,
        )}
      />
    </button>
  );
}
