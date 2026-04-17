import { useEffect, useState } from "react";
import { Button } from "../../../ui/Button";
import type { ConnectionInfo } from "../../../../vite-env";

interface EnvSelectStepProps {
  sourceName: string | null;
  targetName: string | null;
  onSelect: (sourceName: string, targetName: string) => void;
}

export function EnvSelectStep({ sourceName, targetName, onSelect }: EnvSelectStepProps) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [src, setSrc] = useState(sourceName ?? "");
  const [tgt, setTgt] = useState(targetName ?? "");

  const loadConnections = async () => {
    const list = await window.electron.listConnections();
    setConnections(list);
  };

  useEffect(() => {
    loadConnections();
    const handler = (list: ConnectionInfo[]) => setConnections(list);
    window.electron.onConnectionsUpdated(handler);
  }, []);

  const canProceed = src && tgt && src !== tgt;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#858585]">
        Select a source and a target Dynamics 365 environment. Both must be connected.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <EnvCard
          title="Source"
          description="Records will be read from this environment."
          connections={connections}
          selected={src}
          disabledValue={tgt}
          onSelect={setSrc}
          onAddNew={() => window.electron.createConnectionWindow()}
        />
        <EnvCard
          title="Target"
          description="Records will be written to this environment."
          connections={connections}
          selected={tgt}
          disabledValue={src}
          onSelect={setTgt}
          onAddNew={() => window.electron.createConnectionWindow()}
        />
      </div>

      {src === tgt && src !== "" && (
        <p className="text-xs text-[#f48771]">Source and target cannot be the same environment.</p>
      )}

      <div className="flex justify-end">
        <Button
          disabled={!canProceed}
          onClick={() => canProceed && onSelect(src, tgt)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}

interface EnvCardProps {
  title: string;
  description: string;
  connections: ConnectionInfo[];
  selected: string;
  disabledValue: string;
  onSelect: (name: string) => void;
  onAddNew: () => void;
}

function EnvCard({ title, description, connections, selected, disabledValue, onSelect, onAddNew }: EnvCardProps) {
  return (
    <div className="bg-[#252526] border border-[#3c3c3c] rounded-sm p-4 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-[#858585] mt-0.5">{description}</p>
      </div>

      {connections.length === 0 ? (
        <p className="text-xs text-[#858585] italic">No connections yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {connections.map((c) => (
            <label
              key={c.name}
              className={`flex items-center gap-2 p-2 rounded-sm cursor-pointer text-sm transition-colors ${
                c.name === disabledValue
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-[#2a2d2e]"
              }`}
            >
              <input
                type="radio"
                name={`env-${title}`}
                value={c.name}
                checked={selected === c.name}
                disabled={c.name === disabledValue}
                onChange={() => onSelect(c.name)}
                className="accent-[#007fd4]"
              />
              <div>
                <span className="text-[#cccccc] font-medium">{c.name}</span>
                <span className="ml-2 text-[#858585] text-xs">{c.envUrl}</span>
              </div>
            </label>
          ))}
        </div>
      )}

      <Button variant="secondary" onClick={onAddNew} className="text-xs py-1.5 mt-auto">
        + Connect new…
      </Button>
    </div>
  );
}
