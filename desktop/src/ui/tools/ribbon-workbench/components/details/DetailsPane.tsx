import { useMemo } from "react";
import { EmptyState } from "../../../../shared/ui";
import { LOC_LABELS } from "../../model/commandBar";
import { findItem, items } from "../../model/diff";
import { customControl, groupLayout, usedBy } from "../../model/edits";
import { attr, descendants } from "../../model/node";
import { knownIds } from "../../model/rows";
import { ITEM_TAB, type RibbonWorkbenchState } from "../../state/useRibbonWorkbench";
import { CommandEditor } from "./CommandEditor";
import { ControlEditor } from "./ControlEditor";
import { LabelEditor } from "./LabelEditor";
import { RuleEditor } from "./RuleEditor";

const sortIds = (ids: Iterable<string>) => [...new Set(ids)].filter(Boolean).sort((a, b) => a.localeCompare(b));

export function DetailsPane({ state }: { state: RibbonWorkbenchState }) {
  const { selection, currentDiff, base, appBase, canEdit } = state;
  const appDiff = state.diffs.applicationribbon ?? null;
  const readOnly = !canEdit;

  const lists = useMemo(() => {
    const ownCommands = items(currentDiff, "command");
    return {
      solutionCommands: new Set(ownCommands.map((node) => attr(node, "Id") ?? "")),
      commandIds: sortIds(
        [...ownCommands, ...items(appDiff, "command"), ...(base?.commands ?? []), ...(appBase?.commands ?? [])].map(
          (node) => attr(node, "Id") ?? "",
        ),
      ),
      labelIds: sortIds([...items(currentDiff, "label"), ...items(appDiff, "label")].map((node) => attr(node, "Id") ?? "")),
      enable: knownIds(items(currentDiff, "enableRule"), items(appDiff, "enableRule"), base?.enableRules, appBase?.enableRules),
      display: knownIds(items(currentDiff, "displayRule"), items(appDiff, "displayRule"), base?.displayRules, appBase?.displayRules),
      allCommands: [...ownCommands, ...(base?.commands ?? [])],
    };
  }, [appBase, appDiff, base, currentDiff]);

  if (!selection) {
    return <EmptyState className="flex-1" title="Select a button, command, rule or label to see its details." />;
  }

  const openCommand = (id: string) => {
    state.setTab(ITEM_TAB.command);
    state.setSelection({ kind: "command", id });
  };
  const openRule = (kind: "enableRule" | "displayRule", id: string) => {
    state.setTab(ITEM_TAB[kind]);
    state.setSelection({ kind, id });
  };
  const notFound = <EmptyState className="flex-1" title="This item is not in the selected table's command bar." />;

  switch (selection.kind) {
    case "control": {
      const node = state.selectedNode;
      if (!node || !currentDiff && node.source === "custom") return notFound;
      const element = node.source === "custom" ? customControl(currentDiff!, node.id) ?? node.element : node.element;
      return (
        <ControlEditor
          key={node.id}
          node={node}
          element={element}
          readOnly={readOnly}
          readOnlyReason={state.readOnlyReason}
          commandIds={lists.commandIds}
          labelIds={lists.labelIds}
          templates={base?.templates ?? []}
          layout={currentDiff ? groupLayout(currentDiff, node.id) : null}
          solutionCommands={lists.solutionCommands}
          onChange={(next) => state.updateControl(node.id, next)}
          onLayoutChange={(layout) => state.setGroupLayout(node.id, layout)}
          onOpenCommand={openCommand}
          onHide={() => state.hideNode(node)}
          onShow={() => state.showNode(node.id)}
          onCustomise={state.customiseCommand}
          onDelete={() => state.deleteNode(node)}
        />
      );
    }
    case "command": {
      const own = findItem(currentDiff, "command", selection.id);
      const published =
        base?.commands.find((node) => attr(node, "Id") === selection.id) ??
        appBase?.commands.find((node) => attr(node, "Id") === selection.id) ??
        null;
      const command = own ?? published;
      if (!command) return notFound;
      const usedByControls = currentDiff
        ? descendants(currentDiff).filter((node) => attr(node, "Command") === selection.id && node.name !== "CommandDefinition").length
        : 0;
      return (
        <CommandEditor
          command={command}
          readOnly={readOnly || !own}
          notice={own ? null : "This is a built-in command. Customise command copies it into the solution so you can change it."}
          canCustomise={!own && canEdit}
          enableRuleIds={sortIds(lists.enable)}
          displayRuleIds={sortIds(lists.display)}
          knownEnable={lists.enable}
          knownDisplay={lists.display}
          usedByControls={usedByControls}
          onChange={(next) => state.updateItem("command", selection.id, next)}
          onCustomise={() => state.customiseCommand(selection.id)}
          onOpenRule={openRule}
          onDelete={() => state.deleteItem("command", selection.id)}
        />
      );
    }
    case "enableRule":
    case "displayRule": {
      const kind = selection.kind;
      const own = findItem(currentDiff, kind, selection.id);
      const baseRules = kind === "enableRule" ? [...(base?.enableRules ?? []), ...(appBase?.enableRules ?? [])] : [...(base?.displayRules ?? []), ...(appBase?.displayRules ?? [])];
      const rule = own ?? baseRules.find((node) => attr(node, "Id") === selection.id) ?? null;
      if (!rule) return notFound;
      // The published commands still hold this solution's old references, so a solution rule counts only
      // the solution's own commands. A built-in rule lists every command that uses it.
      const users = sortIds(
        own ? usedBy(items(currentDiff, "command"), kind, selection.id) : usedBy(lists.allCommands, kind, selection.id),
      );
      return (
        <RuleEditor
          kind={kind}
          rule={rule}
          ruleTypes={state.data?.ruleTypes ?? []}
          readOnly={readOnly || !own}
          notice={own ? null : "This is a built-in rule. It is shown read-only."}
          usedBy={users}
          onChange={(next) => state.updateItem(kind, selection.id, next)}
          onOpenCommand={openCommand}
          onDelete={() => state.deleteItem(kind, selection.id)}
        />
      );
    }
    case "label": {
      const label = findItem(currentDiff, "label", selection.id);
      if (!label) return notFound;
      const reference = `${LOC_LABELS}${selection.id}`;
      const uses = currentDiff
        ? descendants(currentDiff).filter((node) => Object.values(node.attributes).includes(reference)).length
        : 0;
      return (
        <LabelEditor
          label={label}
          readOnly={readOnly}
          usedBy={uses}
          onChange={(next) => state.updateItem("label", selection.id, next)}
          onDelete={() => state.deleteItem("label", selection.id)}
        />
      );
    }
  }
}
