import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { desktopBridge } from "../../platform/desktopBridge";
import { Alert, Button, Modal, ProgressBar } from "../../shared/ui";
import { useUpdate } from "./updateContext";
import { formatAppVersion, getReleaseUrl, releaseNotesToBlocks } from "./updateStatus";

function formatReleaseDate(value: string | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Shows what's new in an available update and lets the user update now or later. */
export function UpdateDialog() {
  const update = useUpdate();
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    let cancelled = false;
    void desktopBridge.getAppVersion().then((version) => {
      if (!cancelled) {
        setAppVersion(version);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const status = update?.status;
  const details = status && "version" in status ? status : undefined;
  const notes = useMemo(() => releaseNotesToBlocks(details?.releaseNotes), [details?.releaseNotes]);

  if (!update || !status) {
    return null;
  }

  const { dialogOpen, closeDialog, download, install, retry } = update;
  const open =
    dialogOpen &&
    (status.state === "available" ||
      status.state === "downloading" ||
      status.state === "downloaded" ||
      status.state === "error");
  const version = details?.version;
  const newVersion = version ? `Power Tools v${version}` : "A new version of Power Tools";
  const title =
    status.state === "downloaded"
      ? `${newVersion} is ready to install`
      : status.state === "error"
        ? "Update failed"
        : `${newVersion} is available`;
  const releaseDate = formatReleaseDate(details?.releaseDate);
  const current = formatAppVersion(appVersion);
  const subtitle = [current ? `You have ${current}` : null, releaseDate ? `Released ${releaseDate}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal open={open} title={title} onClose={closeDialog} widthClass="max-w-lg">
      {subtitle ? <p className="-mt-1 text-xs text-fg-muted">{subtitle}</p> : null}

      {status.state === "error" ? (
        <Alert tone="danger" title="Power Tools could not update">
          {status.message}
        </Alert>
      ) : (
        <section aria-labelledby="update-notes-heading" className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 id="update-notes-heading" className="text-xs font-semibold text-fg-strong">
              {details?.releaseName && details.releaseName !== version
                ? `What's new in ${details.releaseName}`
                : "What's new"}
            </h4>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-accent-text hover:underline"
              onClick={() => void desktopBridge.openExternalUrl(getReleaseUrl(version))}
            >
              View on GitHub
              <ExternalLink size={12} aria-hidden="true" />
            </button>
          </div>
          <div
            data-testid="update-release-notes"
            className="max-h-[45vh] overflow-auto rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-fg"
          >
            {notes.length === 0 ? (
              <p className="text-fg-muted">No release notes were provided for this version.</p>
            ) : (
              <ReleaseNotes blocks={notes} />
            )}
          </div>
        </section>
      )}

      {status.state === "downloading" ? (
        <ProgressBar value={status.percent ?? 0} max={100} label="Downloading update" />
      ) : null}

      {status.state === "downloaded" ? (
        <p className="text-xs text-fg-muted">
          Power Tools will close, install the update, and open again. Save your work first.
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        {status.state === "available" ? (
          <>
            <Button variant="secondary" onClick={closeDialog}>
              Later
            </Button>
            <Button onClick={download}>Update now</Button>
          </>
        ) : null}
        {status.state === "downloading" ? (
          <>
            <Button variant="secondary" onClick={closeDialog}>
              Hide
            </Button>
            <Button disabled>Downloading…</Button>
          </>
        ) : null}
        {status.state === "downloaded" ? (
          <>
            <Button variant="secondary" onClick={closeDialog}>
              Later
            </Button>
            <Button onClick={install}>Restart and update</Button>
          </>
        ) : null}
        {status.state === "error" ? (
          <>
            <Button variant="secondary" onClick={closeDialog}>
              Close
            </Button>
            <Button onClick={retry}>Try again</Button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function ReleaseNotes({ blocks }: { blocks: ReturnType<typeof releaseNotesToBlocks> }) {
  // Group consecutive items into one list so screen readers announce them as a list.
  const groups: Array<{ kind: "heading" | "paragraph"; text: string } | { kind: "list"; items: string[] }> = [];
  for (const block of blocks) {
    const last = groups[groups.length - 1];
    if (block.kind === "item") {
      if (last?.kind === "list") {
        last.items.push(block.text);
      } else {
        groups.push({ kind: "list", items: [block.text] });
      }
    } else {
      groups.push({ kind: block.kind, text: block.text });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group, index) => {
        if (group.kind === "heading") {
          return (
            <p key={index} className="font-semibold text-fg-strong">
              {group.text}
            </p>
          );
        }
        if (group.kind === "list") {
          return (
            <ul key={index} className="list-disc pl-5 space-y-1">
              {group.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{group.text}</p>;
      })}
    </div>
  );
}
