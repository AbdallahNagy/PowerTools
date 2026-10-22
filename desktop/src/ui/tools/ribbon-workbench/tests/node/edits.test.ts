import { describe, expect, it } from "vitest";
import { buildCommandBar, findBarNode } from "../../model/commandBar";
import { countChanges, emptyDiff, findItem, items, setItem } from "../../model/diff";
import {
  addChild,
  customiseCommand,
  deleteCustom,
  groupLayout,
  hide,
  newCommand,
  newId,
  replaceItem,
  setGroupLayout,
  show,
  updateControl,
} from "../../model/edits";
import { attr, el } from "../../model/node";
import { itemRows } from "../../model/rows";
import { accountBase, accountDiff } from "../fixtures";

const context = { prefix: "new", scope: "account", taken: new Set<string>(["new.account.Button1"]) };
const options = { tabId: "Mscrm.HomepageGrid.account.MainTab", template: "Mscrm.Templates.Flexible2", layout: "LargeMedium" };

function bar(diff = accountDiff()) {
  return buildCommandBar(accountBase().tabs, accountDiff(), diff, "HomepageGrid").tabs;
}

describe("diff sections", () => {
  it("creates missing containers in schema order", () => {
    const diff = setItem(el("RibbonDiffXml"), "label", el("LocLabel", { Id: "x" }));
    const withCommand = setItem(diff, "command", newCommand("c"));

    expect(withCommand.children.map((node) => node.name)).toEqual(["CommandDefinitions", "LocLabels"]);
  });

  it("counts changed items, not keystrokes", () => {
    const loaded = accountDiff();
    let current = hide(loaded, "Mscrm.HomepageGrid.account.Delete", context);
    current = setItem(current, "command", newCommand("new.account.Command1"));

    expect(countChanges(loaded, loaded)).toBe(0);
    expect(countChanges(loaded, current)).toBe(2);
  });
});

describe("edits", () => {
  it("adds a button to a published group with a new custom action and a prefixed, unused id", () => {
    const group = findBarNode(bar(), "Mscrm.HomepageGrid.account.MainTab.Actions")!;

    const { diff, id } = addChild(accountDiff(), group, "button", context, options);

    expect(id).toBe("new.account.Button2");
    const action = findItem(diff, "customAction", "new.account.Button2.CustomAction")!;
    expect(attr(action, "Location")).toBe("Mscrm.HomepageGrid.account.MainTab.Actions.Controls._children");
    const added = findBarNode(bar(diff), id)!;
    expect(added.source).toBe("custom");
    expect(added.sequence).toBe(40);
  });

  it("adds inside a control the solution defines without a second custom action", () => {
    const group = findBarNode(bar(), "Mscrm.HomepageGrid.account.MainTab.Actions")!;
    const withFlyout = addChild(accountDiff(), group, "flyout", context, options);
    const section = findBarNode(bar(withFlyout.diff), `${withFlyout.id}.MenuSection`)!;

    const { diff, id } = addChild(withFlyout.diff, section, "button", context, options);

    expect(items(diff, "customAction")).toHaveLength(items(withFlyout.diff, "customAction").length);
    expect(findBarNode(bar(diff), id)!.source).toBe("custom");
  });

  it("adds a group with a MaxSize scaling entry and deletes both", () => {
    const tab = findBarNode(bar(), "Mscrm.HomepageGrid.account.MainTab")!;
    const { diff, id } = addChild(accountDiff(), tab, "group", context, options);

    expect(groupLayout(diff, id)).toBe("LargeMedium");
    const changed = setGroupLayout(diff, id, tab.id, "LargeSmall");
    expect(groupLayout(changed, id)).toBe("LargeSmall");

    const removed = deleteCustom(changed, findBarNode(bar(changed), id)!);
    expect(items(removed, "customAction")).toHaveLength(1);
  });

  it("hides and shows a published item", () => {
    const hidden = hide(accountDiff(), "Mscrm.HomepageGrid.account.Delete", context);
    const action = items(hidden, "hideAction")[0]!;

    expect(attr(action, "Location")).toBe("Mscrm.HomepageGrid.account.Delete");
    expect(attr(action, "HideActionId")!.startsWith("new.")).toBe(true);
    expect(items(show(hidden, "Mscrm.HomepageGrid.account.Delete"), "hideAction")).toHaveLength(0);
  });

  it("copies a published command into the solution without its rules", () => {
    const base = accountBase().commands[0]!;
    const diff = customiseCommand(accountDiff(), base);

    expect(findItem(diff, "command", "Mscrm.NewRecordFromGrid")).toEqual(base);
    expect(items(diff, "enableRule")).toHaveLength(0);
    expect(customiseCommand(diff, base)).toBe(diff);
  });

  it("renames references when a command, rule, or label id changes", () => {
    let diff = replaceItem(accountDiff(), "command", "new.account.Hello.Command", {
      ...findItem(accountDiff(), "command", "new.account.Hello.Command")!,
      attributes: { Id: "new.account.Greet.Command" },
    });
    diff = replaceItem(diff, "displayRule", "new.account.IsOwner", {
      ...findItem(diff, "displayRule", "new.account.IsOwner")!,
      attributes: { Id: "new.account.CanWrite" },
    });
    diff = replaceItem(diff, "label", "new.account.Hello.Label", {
      ...findItem(diff, "label", "new.account.Hello.Label")!,
      attributes: { Id: "new.account.Greet.Label" },
    });

    const button = findBarNode(bar(diff), "new.account.Hello.Button")!;
    expect(button.command).toBe("new.account.Greet.Command");
    expect(button.label).toBe("$LocLabels:new.account.Greet.Label");
    const command = findItem(diff, "command", "new.account.Greet.Command")!;
    expect(JSON.stringify(command)).toContain("new.account.CanWrite");
  });

  it("updates a custom control in place", () => {
    const button = findItem(accountDiff(), "customAction", "new.account.Hello.CustomAction")!.children[0]!.children[0]!;
    const diff = updateControl(accountDiff(), "new.account.Hello.Button", { ...button, attributes: { ...button.attributes, Sequence: "5" } });

    expect(findBarNode(bar(diff), "new.account.Hello.Button")!.sequence).toBe(5);
  });

  it("makes new ids unique against the diff and the published ribbon", () => {
    expect(newId(emptyDiff(), context, "button")).toBe("new.account.Button2");
    expect(newId(emptyDiff(), { ...context, scope: "ApplicationRibbon" }, "command")).toBe("new.ApplicationRibbon.Command1");
  });
});

describe("item rows", () => {
  it("marks solution items as Custom, overrides as Customised, and lists base items on request", () => {
    const diff = customiseCommand(accountDiff(), accountBase().commands[0]!);

    const own = itemRows("command", diff, accountBase().commands, false, new Set(), new Set());
    const all = itemRows("command", diff, accountBase().commands, true, new Set(), new Set());

    expect(own.map((row) => [row.id, row.source])).toEqual([
      ["new.account.Hello.Command", "custom"],
      ["Mscrm.NewRecordFromGrid", "customised"],
    ]);
    expect(all.map((row) => row.id)).toContain("Mscrm.DeleteSelectedRecord");
    expect(all.find((row) => row.id === "Mscrm.DeleteSelectedRecord")!.source).toBe("base");
  });
});
