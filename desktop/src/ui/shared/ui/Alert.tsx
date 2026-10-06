import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

type AlertTone = "info" | "ok" | "warn" | "danger";

const tones: Record<AlertTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: "bg-accent-soft border-accent-text/40", icon: "text-accent-text", Icon: Info },
  ok: { box: "bg-ok-soft border-ok/40", icon: "text-ok", Icon: CircleCheck },
  warn: { box: "bg-warn-soft border-warn/40", icon: "text-warn", Icon: TriangleAlert },
  danger: { box: "bg-danger-soft border-danger/40", icon: "text-danger", Icon: CircleAlert },
};

interface AlertProps {
  children: ReactNode;
  tone?: AlertTone;
  title?: ReactNode;
  /** Optional action such as a Retry button, shown on the right. */
  action?: ReactNode;
  className?: string;
}

/** Inline message about the current screen. Errors and warnings are announced. */
export function Alert({ children, tone = "info", title, action, className }: AlertProps) {
  const { box, icon, Icon } = tones[tone];
  return (
    <div
      role={tone === "danger" || tone === "warn" ? "alert" : "status"}
      data-tone={tone}
      className={cn("flex items-start gap-2.5 rounded-sm border px-3 py-2 text-sm text-fg", box, className)}
    >
      <Icon size={16} className={cn("shrink-0 mt-0.5", icon)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title ? <p className="font-medium text-fg-strong">{title}</p> : null}
        <div className="break-words">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
