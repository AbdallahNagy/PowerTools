import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  Folder,
  LayoutPanelTop,
  List,
  ListTree,
  Ellipsis,
  MousePointerClick,
  SquareSplitHorizontal,
  Square,
  type LucideIcon,
} from "lucide-react";
import { Alert, Badge, Button, EmptyState, Field, Menu, Select, Spinner, cn, type MenuItem } from "../../../shared/ui";
import { labelText, type BarNode, type BarNodeType, type CommandBar, type LocationOption } from "../model/commandBar";
import { attr } from "../model/node";
import type { AddKind } from "../model/edits";
import type { RibbonNode } from "../model/types";

const ICONS: Record<BarNodeType, LucideIcon> = {
  tab: LayoutPanelTop,
  group: Folder,
  button: MousePointerClick,
  flyout: ListTree,
  splitButton: SquareSplitHorizontal,
  menuSection: List,
  control: Square,
};

interface CommandBarViewProps {
  commandBar: CommandBar;
  labels: ReadonlyMap<string, string>;
  location: string | null;
  locationOptions: LocationOption[];
  onLocationChange: (value: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  notSupported: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canEdit: boolean;
  /** Commands the solution defines; Customise command is offered for others. */
  solutionCommands: ReadonlySet<string>;
  onAdd: (parent: BarNode, kind: AddKind) => void;
  onHide: (node: BarNode) => void;
  onShow: (id: string) => void;
  onCustomise: (commandId: string) => void;
  onDelete: (node: BarNode) => void;
}

export function CommandBarView(props: CommandBarViewProps) {
  if (props.notSupported) return <EmptyState className="flex-1" title="This table does not support a command bar." />;
  if (props.loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-fg-muted" role="status">
        <Spinner /> Loading the command bar…
      </div>
    );
  }
  if (props.error) {
    return (
      <div className="p-3">
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={props.onRetry}>
              Retry
            </Button>
          }
        >
          {props.error}
        </Alert>
      </div>
    );
  }

  const { commandBar } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-end gap-2 border-b border-line px-3 py-2">
        <Field label="Location" className="w-48">
          <Select value={props.location ?? ""} onChange={(event) => props.onLocationChange(event.target.value)}>
            {props.locationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {commandBar.tabs.length === 0 ? (
          <p className="p-4 text-center text-xs text-fg-muted">There are no command bar items at this location.</p>
        ) : (
          <ul role="tree" aria-label="Command bar">
            {commandBar.tabs.map((node) => (
              <TreeNode key={node.id} node={node} depth={0} {...props} />
            ))}
          </ul>
        )}
        {commandBar.hiddenElsewhere.length > 0 ? (
          <HiddenList hides={commandBar.hiddenElsewhere} canEdit={props.canEdit} onShow={props.onShow} />
        ) : null}
      </div>
    </div>
  );
}

function HiddenList({ hides, canEdit, onShow }: { hides: RibbonNode[]; canEdit: boolean; onShow: (id: string) => void }) {
  return (
    <section className="mt-4 border-t border-line pt-3" aria-label="Hidden by this solution">
      <h4 className="px-2 pb-1 text-xs font-medium text-fg-muted">Hidden by this solution</h4>
      <ul>
        {hides.map((hide) => {
          const target = attr(hide, "Location") ?? "";
          return (
            <li key={attr(hide, "HideActionId") ?? target} className="flex items-center gap-2 px-2 py-1">
              <EyeOff size={14} className="text-fg-muted" aria-hidden="true" />
              <span className="flex-1 truncate font-mono text-xs text-fg-muted line-through">{target}</span>
              <Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => onShow(target)}>
                Show again
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function menuItems(node: BarNode, props: CommandBarViewProps): MenuItem[] {
  const { canEdit } = props;
  const result: MenuItem[] = [];
  const add = (label: string, kind: AddKind) =>
    result.push({ label, onSelect: () => props.onAdd(node, kind), disabled: !canEdit || !node.containerId });
  if (node.type === "group" || node.type === "menuSection") {
    add("Add button", "button");
    add("Add flyout", "flyout");
    add("Add split button", "splitButton");
  }
  if (node.type === "flyout" || node.type === "splitButton") add("Add menu section", "menuSection");
  if (node.type === "tab") add("Add group", "group");
  if (node.source === "base") {
    if (node.hidden) result.push({ label: "Show again", onSelect: () => props.onShow(node.id), disabled: !canEdit });
    else result.push({ label: "Hide", onSelect: () => props.onHide(node), disabled: !canEdit });
    if (node.command && !props.solutionCommands.has(node.command)) {
      const command = node.command;
      result.push({ label: "Customise command", onSelect: () => props.onCustomise(command), disabled: !canEdit });
    }
  } else {
    result.push({ label: "Delete", onSelect: () => props.onDelete(node), disabled: !canEdit, danger: true });
  }
  return result;
}

function TreeNode({ node, depth, ...props }: CommandBarViewProps & { node: BarNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const Icon = ICONS[node.type];
  const text = labelText(node.label, props.labels) ?? node.id;
  const selected = props.selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const actions = menuItems(node, props);

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={selected}>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-sm py-1 pr-1",
          selected ? "bg-accent-soft text-fg-strong" : "hover:bg-hover",
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="rounded-sm text-fg-muted hover:text-fg-strong"
            aria-label={open ? `Collapse ${text}` : `Expand ${text}`}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          </button>
        ) : (
          <span className="w-3.5" aria-hidden="true" />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => props.onSelect(node.id)}
        >
          <Icon size={14} className="shrink-0 text-fg-muted" aria-hidden="true" />
          <span className={cn("truncate text-sm", node.hidden && "text-fg-muted line-through")}>{text}</span>
          <span className="truncate font-mono text-2xs text-fg-muted">{node.id}</span>
          {node.source === "custom" ? <Badge tone="accent">Custom</Badge> : null}
          {node.hidden ? <Badge tone="neutral">Hidden</Badge> : null}
          {node.commandCustomised ? <Badge tone="accent">Command customised</Badge> : null}
        </button>
        {actions.length > 0 ? (
          <Menu
            align="end"
            items={actions}
            trigger={
              <Button variant="ghost" size="sm" aria-label={`Actions for ${text}`} className="px-1">
                <Ellipsis size={14} aria-hidden="true" />
              </Button>
            }
          />
        ) : null}
      </div>
      {hasChildren && open ? (
        <ul role="group">
          {node.children.map((item) => (
            <TreeNode key={item.id} {...props} node={item} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
