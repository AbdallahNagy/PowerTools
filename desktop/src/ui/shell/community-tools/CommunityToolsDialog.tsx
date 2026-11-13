import { useState } from "react";
import { FolderOpen } from "lucide-react";

import { desktopBridge, type LoadedCommunityTool } from "../../platform/desktopBridge";
import { Alert, Badge, Button, EmptyState, Modal } from "../../shared/ui";
import { bridgeErrorMessage } from "./bridgeErrorMessage";

const PERMISSION_WORDS: Record<string, string> = {
  "data:read": "Read data",
  "data:write": "Create and update data",
  "data:delete": "Delete data",
  "metadata:read": "Read table definitions",
  "metadata:write": "Change table definitions",
  files: "Open and save files",
};

function toolName(tool: LoadedCommunityTool): string {
  return tool.manifest?.name ?? "Unreadable tool";
}

function statusOf(tool: LoadedCommunityTool): { label: string; tone: "ok" | "warn" | "danger" } {
  if (tool.status === "missing") return { label: "Folder not found", tone: "danger" };
  if (tool.status === "invalid") return { label: "Invalid", tone: "danger" };
  if (!tool.consentGranted) return { label: "Needs review", tone: "warn" };
  return { label: "Ready", tone: "ok" };
}

interface CommunityToolsDialogProps {
  open: boolean;
  tools: readonly LoadedCommunityTool[];
  /** Why the list could not be read, if it could not. */
  loadError: string | null;
  refresh(): Promise<void>;
  onClose(): void;
}

export function CommunityToolsDialog({ open, tools, loadError, refresh, onClose }: CommunityToolsDialogProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const reviewTool = reviewId === null ? null : (tools.find((tool) => tool.id === reviewId) ?? null);
  const error = actionError ?? loadError;

  // Every action ends with a refresh so the registry and this list show the same state.
  // An action that returns false changed nothing (a cancelled folder picker), so there is nothing to re-read.
  const run = async (action: () => Promise<unknown>) => {
    setWorking(true);
    setActionError(null);
    let changed = true;
    try {
      changed = (await action()) !== false;
    } catch (failure) {
      setActionError(bridgeErrorMessage(failure));
      setReviewId(null);
    }
    if (changed) await refresh();
    setWorking(false);
  };

  const close = () => {
    setActionError(null);
    setReviewId(null);
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        title="Community tools"
        description="Tools loaded from folders on this computer."
        onClose={close}
        widthClass="max-w-2xl"
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            disabled={working}
            onClick={() => void run(async () => (await desktopBridge.addCommunityToolFromFolder()) !== null)}
          >
            <FolderOpen size={14} aria-hidden="true" />
            Load from folder…
          </Button>
        </div>
        {tools.length === 0 ? (
          <EmptyState
            title="No community tools are loaded"
            description="Choose Load from folder… and pick a folder that contains powertools-tool.json."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-line border border-line">
            {tools.map((tool) => {
              const status = statusOf(tool);
              const manifest = tool.manifest;
              const name = toolName(tool);
              // The badge already says "Folder not found"; do not say it twice.
              const problems = tool.status === "ready" ? [] : tool.errors.filter((message) => message !== status.label);
              return (
                <li key={tool.id} className="flex flex-col gap-2 p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-fg-strong">{toolName(tool)}</span>
                    {manifest ? <span className="shrink-0 text-xs text-fg-muted">{manifest.version}</span> : null}
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  {manifest ? (
                    <p className="min-w-0 truncate text-xs text-fg-muted">{manifest.publisher.name}</p>
                  ) : (
                    // Without a manifest the folder is the only thing that tells two rows apart.
                    <p className="min-w-0 break-all text-xs text-fg-muted">{tool.folder}</p>
                  )}
                  {problems.length > 0 ? (
                    <ul className="flex flex-col gap-0.5 text-xs text-danger">
                      {problems.map((message, index) => (
                        <li key={index} className="break-words">
                          {message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    {tool.status === "ready" && !tool.consentGranted ? (
                      <Button size="sm" disabled={working} aria-label={`Review permissions for ${name}`} onClick={() => setReviewId(tool.id)}>
                        Review permissions
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={working}
                      aria-label={`Reload ${name}`}
                      onClick={() => void run(async () => undefined)}
                    >
                      Reload
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={working}
                      aria-label={`Remove ${name}`}
                      onClick={() => void run(() => desktopBridge.removeCommunityTool(tool.id))}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
      <Modal
        open={open && reviewTool?.manifest != null}
        title="Review permissions"
        onClose={() => {
          if (!granting) setReviewId(null);
        }}
        busy={granting}
        busyLabel="Saving your choice…"
        widthClass="max-w-md"
        zClass="z-[60]"
      >
        {reviewTool?.manifest ? (
          <>
            <div className="flex flex-col gap-0.5">
              <p className="break-all text-sm font-medium text-fg-strong">{reviewTool.manifest.name}</p>
              <p className="break-all text-xs text-fg-muted">{reviewTool.manifest.publisher.name}</p>
            </div>
            <Alert tone="warn">This tool was loaded from a folder on this computer and has not been reviewed.</Alert>
            <ReviewSection title="Permissions" empty="No permissions">
              {reviewTool.manifest.permissions.map((permission) => PERMISSION_WORDS[permission] ?? permission)}
            </ReviewSection>
            <ReviewSection title="Messages" empty="No messages" mono>
              {reviewTool.manifest.messages}
            </ReviewSection>
            <ReviewSection title="Network hosts" empty="No hosts declared" mono>
              {reviewTool.manifest.network}
            </ReviewSection>
            <p className="text-xs text-fg-muted">
              Power Tools limits which hosts a tool can call, but cannot fully block network access.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={granting} onClick={() => setReviewId(null)}>
                Cancel
              </Button>
              <Button
                disabled={working || granting}
                onClick={() => {
                  setGranting(true);
                  void run(async () => {
                    await desktopBridge.grantCommunityToolConsent(reviewTool.id);
                    setReviewId(null);
                  }).finally(() => setGranting(false));
                }}
              >
                Allow
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}

function ReviewSection({
  title,
  empty,
  mono = false,
  children,
}: {
  title: string;
  empty: string;
  mono?: boolean;
  children: readonly string[];
}) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-fg-muted">{title}</h4>
      {children.length === 0 ? (
        <p className="text-sm text-fg-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm text-fg">
          {children.map((item, index) => (
            <li key={`${item}-${index}`} className={`min-w-0 whitespace-normal break-all ${mono ? "font-mono text-xs" : ""}`}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
