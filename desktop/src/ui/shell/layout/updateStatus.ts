import type { UpdateStatus } from "../../platform/desktopBridge";

export function formatAppVersion(version: string) {
  return version ? `v${version}` : "";
}

export function getUpdateActionLabel(status: UpdateStatus) {
  switch (status.state) {
    case "available":
      return "Update available";
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

export function isUpdateActionDisabled(status: UpdateStatus) {
  return status.state === "downloading";
}
