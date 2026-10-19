import { describe, expect, it } from "vitest";
import {
  applicationLocations,
  buildCommandBar,
  findBarNode,
  labelMap,
  labelText,
} from "../../model/commandBar";
import { items, removeItem } from "../../model/diff";
import { hide } from "../../model/edits";
import { accountBase, accountDiff, applicationBase } from "../fixtures";

const context = { prefix: "new", scope: "account", taken: new Set<string>() };

function ids(nodes: { id: string; children: { id: string }[] }[]): string[] {
  return nodes.flatMap((node) => [node.id, ...node.children.map((child) => child.id)]);
}

describe("buildCommandBar", () => {
  it("shows the location's tabs with controls sorted by sequence and the solution's button once", () => {
    const bar = buildCommandBar(accountBase().tabs, accountDiff(), accountDiff(), "HomepageGrid");

    expect(bar.tabs.map((tab) => tab.id)).toEqual(["Mscrm.HomepageGrid.account.MainTab"]);
    const group = findBarNode(bar.tabs, "Mscrm.HomepageGrid.account.MainTab.Actions")!;
    expect(group.children.map((node) => node.id)).toEqual([
      "Mscrm.HomepageGrid.account.NewRecord",
      "Mscrm.HomepageGrid.account.Delete",
      "new.account.Hello.Button",
    ]);
    const hello = findBarNode(bar.tabs, "new.account.Hello.Button")!;
    expect(hello.source).toBe("custom");
    expect(hello.customActionId).toBe("new.account.Hello.CustomAction");
    expect(findBarNode(bar.tabs, "Mscrm.HomepageGrid.account.NewRecord")!.source).toBe("base");
  });

  it("drops a published custom control the current diff no longer adds", () => {
    const current = removeItem(accountDiff(), "customAction", "new.account.Hello.CustomAction");

    const bar = buildCommandBar(accountBase().tabs, accountDiff(), current, "HomepageGrid");

    expect(findBarNode(bar.tabs, "new.account.Hello.Button")).toBeNull();
  });

  it("marks hidden items and lists hide actions whose target is not in the published ribbon", () => {
    let diff = hide(accountDiff(), "Mscrm.HomepageGrid.account.Delete", context);
    diff = hide(diff, "Mscrm.HomepageGrid.account.AlreadyGone", context);

    const bar = buildCommandBar(accountBase().tabs, accountDiff(), diff, "HomepageGrid");

    expect(findBarNode(bar.tabs, "Mscrm.HomepageGrid.account.Delete")!.hidden).toBe(true);
    expect(bar.hiddenElsewhere.map((node) => node.attributes.Location)).toEqual(["Mscrm.HomepageGrid.account.AlreadyGone"]);
  });

  it("flags a published control whose command the solution redefines", () => {
    const diff = accountDiff();
    const commands = diff.children.find((node) => node.name === "CommandDefinitions")!;
    commands.children.push({ name: "CommandDefinition", attributes: { Id: "Mscrm.NewRecordFromGrid" }, children: [] });

    const bar = buildCommandBar(accountBase().tabs, accountDiff(), diff, "HomepageGrid");

    expect(findBarNode(bar.tabs, "Mscrm.HomepageGrid.account.NewRecord")!.commandCustomised).toBe(true);
  });

  it("filters tabs by location", () => {
    expect(ids(buildCommandBar(accountBase().tabs, null, null, "Form").tabs)).toEqual([
      "Mscrm.Form.account.MainTab",
      "Mscrm.Form.account.MainTab.Save",
    ]);
  });

  it("derives application ribbon locations from tab ids", () => {
    expect(applicationLocations(applicationBase().tabs)).toEqual([{ value: "BasicHomeTab", label: "Home" }]);
  });
});

describe("labels", () => {
  it("resolves LocLabels references and leaves resource keys to the caller", () => {
    const labels = labelMap(items(accountDiff(), "label"));

    expect(labelText("$LocLabels:new.account.Hello.Label", labels)).toBe("Hello");
    expect(labelText("$Resources:Ribbon.New", labels)).toBeNull();
    expect(labelText("Plain", labels)).toBe("Plain");
  });
});
