import { useState } from "react";
import { Stepper } from "../../ui/Stepper";
import { ToastProvider } from "../../ui/Toast";
import { EnvSelectStep } from "./steps/EnvSelectStep";
import { EntityListStep } from "./steps/EntityListStep";
import { AttributeSelectStep } from "./steps/AttributeSelectStep";
import { FilterStep } from "./steps/FilterStep";
import { SettingsStep, type MigrationMode } from "./steps/SettingsStep";
import { PreviewStep } from "./steps/PreviewStep";
import { RunStep } from "./steps/RunStep";
import type { EntityInfo } from "../../../api/hooks/useEntities";

const STEPS = [
  { label: "Environments" },
  { label: "Entity" },
  { label: "Attributes" },
  { label: "Filter" },
  { label: "Settings" },
  { label: "Preview" },
  { label: "Migrate" },
];

interface WizardState {
  step: number;
  sourceName: string | null;
  targetName: string | null;
  entity: EntityInfo | null;
  attributes: string[];
  fetchFilter: string;
  mode: MigrationMode;
  matchAttribute: string;
}

const initialState: WizardState = {
  step: 0,
  sourceName: null,
  targetName: null,
  entity: null,
  attributes: [],
  fetchFilter: "",
  mode: "create",
  matchAttribute: "",
};

export default function DataMigration() {
  const [state, setState] = useState<WizardState>(initialState);

  const patch = (updates: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...updates }));

  return (
    <ToastProvider>
      <div className="flex flex-col flex-1 min-h-0 p-6 text-[#cccccc] overflow-hidden">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white mb-4">Data Migration</h2>
          <Stepper steps={STEPS} currentStep={state.step} />
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-auto">
          {state.step === 0 && (
            <EnvSelectStep
              sourceName={state.sourceName}
              targetName={state.targetName}
              onSelect={(sourceName, targetName) =>
                patch({ sourceName, targetName, step: 1 })
              }
            />
          )}

          {state.step === 1 && (
            <EntityListStep
              onSelect={(entity) => patch({ entity, attributes: [], step: 2 })}
              onBack={() => patch({ step: 0 })}
            />
          )}

          {state.step === 2 && state.entity && (
            <AttributeSelectStep
              entityLogicalName={state.entity.logicalName}
              selectedAttributes={state.attributes}
              onNext={(attributes) => patch({ attributes, step: 3 })}
              onBack={() => patch({ step: 1 })}
            />
          )}

          {state.step === 3 && state.entity && (
            <FilterStep
              entityLogicalName={state.entity.logicalName}
              selectedAttributes={state.attributes}
              initialFilter={state.fetchFilter}
              onNext={(fetchFilter) => patch({ fetchFilter, step: 4 })}
              onBack={() => patch({ step: 2 })}
            />
          )}

          {state.step === 4 && (
            <SettingsStep
              selectedAttributes={state.attributes}
              initialMode={state.mode}
              initialMatchAttribute={state.matchAttribute}
              onNext={(mode, matchAttribute) => patch({ mode, matchAttribute, step: 5 })}
              onBack={() => patch({ step: 3 })}
            />
          )}

          {state.step === 5 && state.entity && (
            <PreviewStep
              entityLogicalName={state.entity.logicalName}
              attributes={state.attributes}
              fetchXmlFilter={state.fetchFilter}
              onNext={() => patch({ step: 6 })}
              onBack={() => patch({ step: 4 })}
            />
          )}

          {state.step === 6 && state.entity && state.targetName && (
            <RunStep
              entityLogicalName={state.entity.logicalName}
              attributes={state.attributes}
              fetchXmlFilter={state.fetchFilter}
              mode={state.mode}
              matchAttribute={state.matchAttribute}
              targetConnectionName={state.targetName}
              onBack={() => patch({ step: 5 })}
              onReset={() => setState(initialState)}
            />
          )}
        </div>
      </div>
    </ToastProvider>
  );
}
