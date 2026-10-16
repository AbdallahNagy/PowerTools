import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Star } from "lucide-react";
import { desktopBridge, type WhatsNew } from "../../platform/desktopBridge";
import { Button, Modal } from "../../shared/ui";
import { ReleaseNotes } from "./ReleaseNotes";
import { REPOSITORY_URL, formatReleaseDate, getReleaseUrl, releaseNotesToBlocks } from "./updateStatus";

/**
 * Opens once after the app was updated and shows that version's release notes.
 * The first time it opens, it also asks the user to star the repository.
 */
export function WhatsNewDialog() {
  const [whatsNew, setWhatsNew] = useState<WhatsNew | null>(null);

  useEffect(() => {
    let cancelled = false;
    void desktopBridge.getWhatsNew().then((next) => {
      if (!cancelled) {
        setWhatsNew(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const notes = useMemo(() => releaseNotesToBlocks(whatsNew?.releaseNotes), [whatsNew?.releaseNotes]);

  if (!whatsNew) {
    return null;
  }

  const close = () => {
    setWhatsNew(null);
    void desktopBridge.dismissWhatsNew();
  };
  const releaseUrl = getReleaseUrl(whatsNew.version);
  const releaseDate = formatReleaseDate(whatsNew.releaseDate);

  return (
    <Modal open title={`Power Tools updated to v${whatsNew.version}`} onClose={close} widthClass="max-w-lg">
      {releaseDate ? <p className="-mt-1 text-xs text-fg-muted">Released {releaseDate}</p> : null}

      <section aria-labelledby="whats-new-heading" className="flex min-h-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 id="whats-new-heading" className="text-xs font-semibold text-fg-strong">
            What&apos;s new
          </h4>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-accent-text hover:underline"
            onClick={() => void desktopBridge.openExternalUrl(releaseUrl)}
          >
            View on GitHub
            <ExternalLink size={12} aria-hidden="true" />
          </button>
        </div>
        <div
          data-testid="whats-new-release-notes"
          className="max-h-[45vh] overflow-auto rounded-sm border border-line bg-canvas px-3 py-2 text-sm text-fg"
        >
          {notes.length === 0 ? (
            <p className="text-fg-muted">The release notes for this version are on GitHub.</p>
          ) : (
            <ReleaseNotes blocks={notes} />
          )}
        </div>
      </section>

      {whatsNew.showStarPrompt ? (
        <section
          aria-labelledby="whats-new-star-heading"
          className="flex items-center gap-3 rounded-sm border border-accent-text/40 bg-accent-soft px-3 py-2.5"
        >
          <Star size={18} className="shrink-0 text-accent-text" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h4 id="whats-new-star-heading" className="text-sm font-semibold text-fg-strong">
              Enjoying Power Tools?
            </h4>
            <p className="text-xs text-fg-muted">A star on GitHub helps other Dataverse makers find it.</p>
          </div>
          <Button variant="secondary" onClick={() => void desktopBridge.openExternalUrl(REPOSITORY_URL)}>
            Star on GitHub
          </Button>
        </section>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={close}>Got it</Button>
      </div>
    </Modal>
  );
}
