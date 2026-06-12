import { useEffect, useState } from "react";
import type { ConnectionInfo } from "../../../vite-env";

interface ConnectionsBarProps {
  sourceName: string;
  targetName: string;
  onSourceChange: (name: string) => void;
  onTargetChange: (name: string) => void;
}

export function ConnectionsBar({
  sourceName,
  targetName,
  onSourceChange,
  onTargetChange,
}: ConnectionsBarProps) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);

  useEffect(() => {
    window.electron.listConnections().then(setConnections);
    window.electron.onConnectionsUpdated(setConnections);
  }, []);

  return (
    <div className="flex items-end gap-3">
      <ConnectionSelect
        label="Source"
        value={sourceName}
        exclude={targetName}
        connections={connections}
        onChange={onSourceChange}
      />
      <span className="text-[#858585] pb-1.5">→</span>
      <ConnectionSelect
        label="Target"
        value={targetName}
        exclude={sourceName}
        connections={connections}
        onChange={onTargetChange}
      />
    </div>
  );
}

interface ConnectionSelectProps {
  label: string;
  value: string;
  exclude: string;
  connections: ConnectionInfo[];
  onChange: (name: string) => void;
}

function ConnectionSelect({
  label,
  value,
  exclude,
  connections,
  onChange,
}: ConnectionSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[#858585] uppercase tracking-wider">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] text-sm px-2 py-1.5 rounded-sm
                   focus:outline-none focus:border-[#007fd4] w-52"
      >
        <option value="">— select —</option>
        {connections.map((c) => (
          <option key={c.name} value={c.name} disabled={c.name === exclude}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
