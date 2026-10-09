import type { UpdateStatus } from "../../platform/desktopBridge";

export const RELEASES_URL = "https://github.com/AbdallahNagy/PowerTools/releases";

export function formatAppVersion(version: string) {
  return version ? `v${version}` : "";
}

function updateVersion(status: UpdateStatus) {
  return "version" in status && status.version ? status.version : undefined;
}

export function getUpdateActionLabel(status: UpdateStatus) {
  const version = updateVersion(status);
  switch (status.state) {
    case "available":
      return version ? `Update to v${version}` : "Update available";
    case "downloading":
      return typeof status.percent === "number"
        ? `Downloading ${Math.round(status.percent)}%`
        : "Downloading...";
    case "downloaded":
      return "Restart to update";
    case "error":
      return "Update failed";
    default:
      return null;
  }
}

/** One sentence that tells the user what clicking the update button does. */
export function getUpdateActionHint(status: UpdateStatus) {
  const version = updateVersion(status);
  const named = version ? `Power Tools v${version}` : "A new version of Power Tools";
  switch (status.state) {
    case "available":
      return `${named} is available. Click to see what's new and update.`;
    case "downloading":
      return `Downloading ${version ? `v${version}` : "the update"}. You can keep working.`;
    case "downloaded":
      return `${named} is ready. Click to restart and install it.`;
    case "error":
      return `The update failed: ${status.message}. Click to try again.`;
    default:
      return null;
  }
}

export function isUpdateActionDisabled(status: UpdateStatus) {
  return status.state === "downloading";
}

/** States where the update dialog opens by itself once per launch. */
export function shouldPromptForUpdate(status: UpdateStatus) {
  return status.state === "available" || status.state === "downloaded";
}

export function getReleaseUrl(version: string | undefined) {
  return version ? `${RELEASES_URL}/tag/v${version}` : RELEASES_URL;
}

export type ReleaseNoteBlock = {
  kind: "heading" | "paragraph" | "item";
  text: string;
};

const BLOCK_KINDS: Record<string, ReleaseNoteBlock["kind"]> = {
  H1: "heading",
  H2: "heading",
  H3: "heading",
  H4: "heading",
  H5: "heading",
  H6: "heading",
  P: "paragraph",
  LI: "item",
  PRE: "paragraph",
  BLOCKQUOTE: "paragraph",
};

const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

function collapse(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Turns the release notes HTML from GitHub into plain text blocks. The dialog
 * renders these as React text, so markup in the notes is never executed.
 */
export function releaseNotesToBlocks(html: string | undefined): ReleaseNoteBlock[] {
  if (!html?.trim()) {
    return [];
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: ReleaseNoteBlock[] = [];
  let loose = "";

  const flushLoose = () => {
    const text = collapse(loose);
    if (text) {
      blocks.push({ kind: "paragraph", text });
    }
    loose = "";
  };

  const textOf = (element: Element): string => {
    let text = "";
    element.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent ?? "";
      } else if (child instanceof Element && !SKIPPED_TAGS.has(child.tagName)) {
        // Nested lists become their own items.
        if (child.tagName === "UL" || child.tagName === "OL") {
          return;
        }
        text += child.tagName === "BR" ? " " : textOf(child);
      }
    });
    return text;
  };

  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        loose += child.textContent ?? "";
        return;
      }
      if (!(child instanceof Element) || SKIPPED_TAGS.has(child.tagName)) {
        return;
      }
      const kind = BLOCK_KINDS[child.tagName];
      if (kind) {
        flushLoose();
        const text = collapse(textOf(child));
        if (text) {
          blocks.push({ kind, text });
        }
        if (kind === "item") {
          child.querySelectorAll(":scope > ul, :scope > ol").forEach(walk);
        }
        return;
      }
      if (child.tagName === "BR") {
        flushLoose();
        return;
      }
      if (child.tagName === "UL" || child.tagName === "OL" || child.tagName === "DIV") {
        flushLoose();
        walk(child);
        flushLoose();
        return;
      }
      walk(child);
    });
  };

  walk(doc.body);
  flushLoose();
  return blocks;
}
