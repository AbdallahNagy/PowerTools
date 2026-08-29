import { useConnections, useConnectionSelection } from "../../shared/connections";

export default function PluginRegistration() {
  const { connectionName, setConnectionName } = useConnectionSelection();
  const { connections } = useConnections();

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4 text-[#cccccc] overflow-hidden">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#858585] tracking-wider">Connection</label>
        <select
          value={connectionName}
          onChange={(e) => {
            setConnectionName(e.target.value);
          }}
          className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] text-sm px-2 py-1.5 rounded-sm focus:outline-none focus:border-[#007fd4] w-52"
        >
          <option value="">— select —</option>
          {connections.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
