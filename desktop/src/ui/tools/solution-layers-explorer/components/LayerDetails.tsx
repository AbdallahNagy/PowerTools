import { useState } from "react";
import { Button, CodeEditor, EmptyState, Tabs } from "../../../shared/ui";
import { prettyText } from "../model/componentJson";
import type { Layer } from "../model/types";
import { PropertyView, type PropertyViewMode } from "./PropertyView";

export type ContentTab = "changes" | "all" | "children";

interface LayerDetailsProps {
  componentType: number;
  layer: Layer;
  tab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
}

function JsonContent({ value, label, empty }: { value: string | null; label: string; empty: string }) {
  const text = prettyText(value);
  if (text.trim() === "") return <EmptyState title={empty} />;
  return (
    <div className="flex h-full min-h-0 flex-col pt-2">
      <CodeEditor value={text} readOnly lineNumbers folding aria-label={label} className="flex-1" />
    </div>
  );
}

const MODES: Array<{ value: PropertyViewMode; label: string }> = [
  { value: "properties", label: "Properties" },
  { value: "json", label: "JSON" },
];

export function LayerDetails({ componentType, layer, tab, onTabChange }: LayerDetailsProps) {
  const [mode, setMode] = useState<PropertyViewMode>("properties");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-strong">
          Layer {layer.order} · {layer.solutionName}
        </p>
        {tab === "children" ? null : (
          <div role="group" aria-label="Show as" className="flex gap-1">
            {MODES.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={mode === option.value ? "secondary" : "ghost"}
                aria-pressed={mode === option.value}
                onClick={() => setMode(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      <Tabs
        aria-label="Layer content"
        value={tab}
        onValueChange={(value) => onTabChange(value as ContentTab)}
        className="flex-1"
        items={[
          {
            value: "changes",
            label: "Changes",
            content: (
              <PropertyView
                componentType={componentType}
                raw={layer.changes}
                label="Changes"
                empty="This layer records no changes."
                mode={mode}
              />
            ),
          },
          {
            value: "all",
            label: "All properties",
            content: (
              <PropertyView
                componentType={componentType}
                raw={layer.componentJson}
                label="All properties"
                empty="This layer has no properties."
                mode={mode}
              />
            ),
          },
          {
            value: "children",
            label: "Children",
            content: (
              <JsonContent value={layer.children} label="Children" empty="This layer has no child components." />
            ),
          },
        ]}
      />
    </div>
  );
}
