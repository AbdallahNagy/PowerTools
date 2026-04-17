import { useState } from "react";
import { Checkbox } from "../../../ui/Checkbox";
import { Button } from "../../../ui/Button";

export type MigrationMode = "create" | "update" | "upsert";

interface SettingsStepProps {
  selectedAttributes: string[];
  initialMode: MigrationMode;
  initialMatchAttribute: string;
  onNext: (mode: MigrationMode, matchAttribute: string) => void;
  onBack: () => void;
}

export function SettingsStep({
  selectedAttributes,
  initialMode,
  initialMatchAttribute,
  onNext,
  onBack,
}: SettingsStepProps) {
  const [doCreate, setDoCreate] = useState(initialMode === "create" || initialMode === "upsert");
  const [doUpdate, setDoUpdate] = useState(initialMode === "update" || initialMode === "upsert");
  const [matchAttr, setMatchAttr] = useState(initialMatchAttribute);

  const mode: MigrationMode = doCreate && doUpdate ? "upsert" : doUpdate ? "update" : "create";
  const needsMatch = doUpdate;
  const canProceed = (doCreate || doUpdate) && (!needsMatch || matchAttr);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[#858585] uppercase tracking-wider">Migration Mode</p>

        <label className="flex items-start gap-3 cursor-pointer group">
          <Checkbox checked={doCreate} onChange={setDoCreate} />
          <div>
            <span className="text-sm text-[#cccccc] font-medium">Create new records</span>
            <p className="text-xs text-[#858585] mt-0.5">
              Records from the source that don't exist in the target will be created.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer group">
          <Checkbox checked={doUpdate} onChange={setDoUpdate} />
          <div>
            <span className="text-sm text-[#cccccc] font-medium">Update existing records</span>
            <p className="text-xs text-[#858585] mt-0.5">
              Records that already exist in the target will be updated with source values.
            </p>
          </div>
        </label>

        {!doCreate && !doUpdate && (
          <p className="text-xs text-[#f48771]">Select at least one option.</p>
        )}
      </div>

      {needsMatch && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-[#858585] uppercase tracking-wider">Match Attribute</label>
          <p className="text-xs text-[#858585]">
            Used to identify matching records in the target environment.
          </p>
          <select
            value={matchAttr}
            onChange={(e) => setMatchAttr(e.target.value)}
            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] text-sm p-2 rounded-sm
                       focus:outline-none focus:border-[#007fd4] w-64"
          >
            <option value="">— choose attribute —</option>
            {selectedAttributes.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {needsMatch && !matchAttr && (
            <p className="text-xs text-[#f48771]">A match attribute is required for updates.</p>
          )}
        </div>
      )}

      <div className="bg-[#252526] border border-[#3c3c3c] rounded-sm p-3 text-xs text-[#858585]">
        <span className="text-[#cccccc] font-medium">Mode: </span>
        {mode === "upsert" && "Create + Update (upsert) — records are created or updated depending on whether they exist in the target."}
        {mode === "create" && "Create only — existing records in the target will not be modified."}
        {mode === "update" && "Update only — only records that already exist in the target will be updated."}
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="text-sm text-[#858585] hover:text-white transition-colors">
          ← Back
        </button>
        <Button disabled={!canProceed} onClick={() => canProceed && onNext(mode, matchAttr)}>
          Next →
        </Button>
      </div>
    </div>
  );
}
