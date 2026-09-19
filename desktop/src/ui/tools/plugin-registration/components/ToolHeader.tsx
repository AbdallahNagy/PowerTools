import { Button, Checkbox, SearchInput } from "../../../shared/ui";
import { useConnections, type ConnectionInfo } from "../../../shared/connections";

interface ToolHeaderProps {
  connectionName: string;
  onConnectionChange: (name: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  showSystem: boolean;
  onShowSystemChange: (value: boolean) => void;
  onRefresh: () => void;
  refreshDisabled: boolean;
  onRegisterAssembly: () => void;
  registerAssemblyDisabled: boolean;
}

export function ToolHeader({
  connectionName,
  onConnectionChange,
  search,
  onSearchChange,
  showSystem,
  onShowSystemChange,
  onRefresh,
  refreshDisabled,
  onRegisterAssembly,
  registerAssemblyDisabled,
}: ToolHeaderProps) {
  const { connections } = useConnections();

  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="flex items-end gap-3 flex-wrap">
        <ConnectionSelect
          label="Connection"
          value={connectionName}
          connections={connections}
          onChange={onConnectionChange}
        />
        <div className="w-64">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="Search assemblies, types, steps…"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-text-dark-gray)] pb-1.5">
          <Checkbox checked={showSystem} onChange={onShowSystemChange} id="show-system" />
          Show system
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onRefresh}
          disabled={refreshDisabled}
        >
          Refresh
        </Button>
        <Button
          type="button"
          onClick={onRegisterAssembly}
          disabled={registerAssemblyDisabled}
        >
          Register assembly
        </Button>
      </div>
    </div>
  );
}

function ConnectionSelect({
  label,
  value,
  connections,
  onChange,
}: {
  label: string;
  value: string;
  connections: ConnectionInfo[];
  onChange: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[var(--color-text-dark-gray)] tracking-wider">
        {label}
      </label>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="connection-select bg-[var(--color-bg-light)] border border-[var(--color-border-dark)] text-[var(--color-text-gray)] text-sm px-2 py-1.5 rounded-sm focus:outline-none focus:border-[var(--color-primary)] w-52"
      >
        <option value="">— select —</option>
        {connections.map((connection) => (
          <option key={connection.name} value={connection.name}>
            {connection.name}
          </option>
        ))}
      </select>
    </div>
  );
}
