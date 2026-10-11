import { CodeEditor, EmptyState, Tabs } from "../../../shared/ui";
import { prettyText } from "../model/componentJson";
import type { Layer } from "../model/types";

export type ContentTab = "changes" | "all" | "children";

interface LayerDetailsProps {
  layer: Layer;
  tab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
}

function Content({ value, label, empty }: { value: string | null; label: string; empty: string }) {
  const text = prettyText(value);
  if (text.trim() === "") return <EmptyState title={empty} />;
  return (
    <div className="flex h-full min-h-0 flex-col pt-2">
      <CodeEditor value={text} readOnly lineNumbers folding aria-label={label} className="flex-1" />
    </div>
  );
}

export function LayerDetails({ layer, tab, onTabChange }: LayerDetailsProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <p className="text-sm text-fg-strong">
        Layer {layer.order} · {layer.solutionName}
      </p>
      <Tabs
        aria-label="Layer content"
        value={tab}
        onValueChange={(value) => onTabChange(value as ContentTab)}
        className="flex-1"
        items={[
          {
            value: "changes",
            label: "Changes",
            content: <Content value={layer.changes} label="Changes" empty="This layer records no changes." />,
          },
          {
            value: "all",
            label: "All properties",
            content: (
              <Content value={layer.componentJson} label="All properties" empty="This layer has no properties." />
            ),
          },
          {
            value: "children",
            label: "Children",
            content: (
              <Content value={layer.children} label="Children" empty="This layer has no child components." />
            ),
          },
        ]}
      />
    </div>
  );
}
