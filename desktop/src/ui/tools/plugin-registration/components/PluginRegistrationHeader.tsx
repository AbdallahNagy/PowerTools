import type { ConnectionInfo } from "../../../shared/connections";
import { Button } from "../../../shared/ui";

interface PluginRegistrationHeaderProps {
  connections: ConnectionInfo[];
  connectionName: string;
  onConnectionChange: (name: string) => void;
  onRefresh: () => void;
  refreshDisabled: boolean;
  onRegisterAssembly: () => void;
  registerDisabled: boolean;
}

export function PluginRegistrationHeader({
  connections,
  connectionName,
  onConnectionChange,
  onRefresh,
  refreshDisabled,
  onRegisterAssembly,
  registerDisabled,
}: PluginRegistrationHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-4 flex-wrap">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="plugin-registration-connection" className="text-xs text-[#858585] tracking-wider">
            Connection
          </label>
          <select
            id="plugin-registration-connection"
            value={connectionName}
            onChange={(event) => onConnectionChange(event.target.value)}
            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] text-sm px-2 py-1.5 rounded-sm focus:outline-none focus:border-[#007fd4] w-52"
          >
            <option value="">— select —</option>
            {connections.map((connection) => (
              <option key={connection.name} value={connection.name}>
                {connection.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="p-2 h-8 w-8 flex items-center justify-center"
          aria-label="Refresh registrations"
          title="Refresh registrations"
          disabled={refreshDisabled}
          onClick={onRefresh}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 11a8 8 0 1 0-2.34 5.66" />
            <path d="M20 4v7h-7" />
          </svg>
        </Button>
      </div>

      <Button type="button" onClick={onRegisterAssembly} disabled={registerDisabled}>
        Register assembly
      </Button>
    </header>
  );
}
