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

// The thumb sits 2px inside the track on both sides: on = track width - thumb - 2px.
const SIZES = {
  md: { track: "h-5 w-9", thumb: "size-4", on: "translate-x-[18px]", off: "translate-x-0.5" },
  sm: { track: "h-4 w-7", thumb: "size-3", on: "translate-x-3.5", off: "translate-x-0.5" },
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
        "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-control enabled:hover:bg-control-hover" : "bg-line-strong enabled:hover:bg-fg-muted",
        s.track,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block rounded-full bg-control-fg shadow-sm transition-transform duration-150 ease-out motion-reduce:transition-none",
          s.thumb,
          checked ? s.on : s.off,
        )}
      />
    </button>
  );
}
