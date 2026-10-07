import {
  useConnections,
  type ConnectionInfo,
} from "../../../shared/connections";
import { Field, Select } from "../../../shared/ui";

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
  const { connections } = useConnections();

  return (
    <div className="flex items-end gap-3">
      <ConnectionSelect
        label="Source"
        value={sourceName}
        exclude={targetName}
        connections={connections}
        onChange={onSourceChange}
      />
      <span className="text-fg-muted pb-1.5">→</span>
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
    <Field label={label}>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-52 [&>select]:bg-raised"
      >
        <option value="">— select —</option>
        {connections.map((c) => (
          <option key={c.name} value={c.name} disabled={c.name === exclude}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
