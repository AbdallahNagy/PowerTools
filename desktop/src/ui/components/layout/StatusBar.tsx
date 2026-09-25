import { useEffect, useState } from "react";
import {
  desktopBridge,
  type UpdateStatus,
} from "../../platform/desktopBridge";
import { useConnections } from "../../shared/connections";
import { useStatusItems } from "../../shared/status";
import {
  formatAppVersion,
  getUpdateActionLabel,
  isUpdateActionDisabled,
} from "./updateStatus";

const StatusBar = () => {
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: "idle" });
  const { activeConnectionName } = useConnections();
  const items = useStatusItems();
  const updateActionLabel = getUpdateActionLabel(updateStatus);

  useEffect(() => {
    desktopBridge.getAppVersion().then(setAppVersion);
    desktopBridge.getUpdateStatus().then(setUpdateStatus);
    const unsubscribeUpdateStatus =
      desktopBridge.onUpdateStatusChanged(setUpdateStatus);
    return () => {
      unsubscribeUpdateStatus();
    };
  }, []);

  const runUpdateAction = () => {
    if (updateStatus.state === "available") {
      desktopBridge.downloadUpdate();
    } else if (updateStatus.state === "downloaded") {
      desktopBridge.installUpdate();
    } else if (updateStatus.state === "error") {
      desktopBridge.checkForUpdates();
    }
  };

  return (
    <div className="h-6 bg-(--color-primary) flex items-center justify-between px-2 text-white text-xs select-none">
      <span>{activeConnectionName ? `connected to: ${activeConnectionName}` : ""}</span>
      <div className="flex items-center space-x-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center">
            {item.content}
          </div>
        ))}
        {updateActionLabel && (
          <button
            type="button"
            className="hover:bg-white/15 px-1 rounded cursor-pointer disabled:cursor-default disabled:opacity-80"
            onClick={runUpdateAction}
            disabled={isUpdateActionDisabled(updateStatus)}
            title={
              updateStatus.state === "error"
                ? updateStatus.message
                : undefined
            }
          >
            {updateActionLabel}
          </button>
        )}
        <span>{formatAppVersion(appVersion)}</span>
      </div>
    </div>
  );
};

export default StatusBar;
