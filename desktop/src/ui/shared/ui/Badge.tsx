import type { ReactNode } from "react";
import { cn } from "./cn";

type BadgeTone = "neutral" | "accent" | "ok" | "warn" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-raised text-fg-muted border-line",
  accent: "bg-accent-soft text-accent-text border-transparent",
  ok: "bg-ok-soft text-ok border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

/** Short label for a state or category, such as Managed or Custom. */
export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
