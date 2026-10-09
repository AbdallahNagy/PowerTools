import { CircleAlert, Download, LoaderCircle, RotateCw, type LucideIcon } from "lucide-react";
import type { UpdateStatus } from "../../platform/desktopBridge";
import { cn } from "../../shared/ui";
import { useUpdate } from "./updateContext";
import { getUpdateActionHint, getUpdateActionLabel } from "./updateStatus";

const ICONS: Partial<Record<UpdateStatus["state"], LucideIcon>> = {
  available: Download,
  downloading: LoaderCircle,
  downloaded: RotateCw,
  error: CircleAlert,
};

interface UpdateButtonProps {
  /** "title-bar" is the prominent pill; "status-bar" sits on the teal bar. */
  placement: "title-bar" | "status-bar";
}

/** Opens the update dialog. Renders nothing when there is no update to act on. */
export function UpdateButton({ placement }: UpdateButtonProps) {
  const update = useUpdate();
  if (!update) {
    return null;
  }

  const { status, openDialog } = update;
  const label = getUpdateActionLabel(status);
  if (!label) {
    return null;
  }

  const Icon = ICONS[status.state];
  const hint = getUpdateActionHint(status) ?? label;
  const failed = status.state === "error";

  return (
    <button
      type="button"
      data-update-state={status.state}
      aria-label={hint}
      title={hint}
      onClick={openDialog}
      className={cn(
        "app-no-drag flex items-center gap-1.5 rounded-sm font-medium",
        placement === "title-bar"
          ? cn(
              "my-1 mr-2 px-2.5",
              failed
                ? "bg-danger-soft text-danger hover:bg-danger/25"
                : "bg-accent text-accent-fg hover:bg-accent-hover",
            )
          : "px-1 hover:bg-accent-fg/15",
      )}
    >
      {Icon ? (
        <Icon
          size={placement === "title-bar" ? 14 : 12}
          className={status.state === "downloading" ? "animate-spin" : undefined}
          aria-hidden="true"
        />
      ) : null}
      {label}
    </button>
  );
}
