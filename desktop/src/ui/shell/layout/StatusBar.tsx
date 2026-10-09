import { useContext, useEffect, useState } from "react";
import { desktopBridge } from "../../platform/desktopBridge";
import { TabProviderContext } from "../tabs/TabProviderContext";
import { useStatusItems } from "../../shared/status";
import { formatAppVersion } from "./updateStatus";

const StatusBar = () => {
  const [appVersion, setAppVersion] = useState("");
  const tabs = useContext(TabProviderContext);
  const activeTab = tabs?.tabs.find((tab) => tab.id === tabs.activeTabId);
  const connectionName = activeTab?.connectionName || null;
  const items = useStatusItems();

  useEffect(() => {
    desktopBridge.getAppVersion().then(setAppVersion);
  }, []);

  return (
    <div className="h-6 bg-accent flex items-center justify-between px-2 text-accent-fg text-xs select-none">
      <span>{connectionName ? `connected to: ${connectionName}` : ""}</span>
      <div className="flex items-center space-x-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center">
            {item.content}
          </div>
        ))}
        <span>{formatAppVersion(appVersion)}</span>
      </div>
    </div>
  );
};

export default StatusBar;
