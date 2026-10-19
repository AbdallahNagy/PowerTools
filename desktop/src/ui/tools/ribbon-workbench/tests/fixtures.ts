import { el } from "../model/node";
import type { BaseRibbon, LoadResponse, PublishJob, RibbonNode, RuleType } from "../model/types";

/** Small ribbon data written for these tests. Nothing is copied from a real environment. */

export const solutionsFixture = {
  solutions: [
    { id: "s1", uniqueName: "new_RibbonEdits", friendlyName: "Ribbon edits", publisherPrefix: "new", version: "1.0.0.0" },
    { id: "s2", uniqueName: "new_Other", friendlyName: "Other", publisherPrefix: "new", version: "1.0.0.0" },
  ],
};

export function accountDiff(): RibbonNode {
  return el("RibbonDiffXml", {}, [
    el("CustomActions", {}, [
      el(
        "CustomAction",
        { Id: "new.account.Hello.CustomAction", Location: "Mscrm.HomepageGrid.account.MainTab.Actions.Controls._children", Sequence: "30" },
        [
          el("CommandUIDefinition", {}, [
            el("Button", {
              Id: "new.account.Hello.Button",
              Command: "new.account.Hello.Command",
              LabelText: "$LocLabels:new.account.Hello.Label",
              Sequence: "30",
              TemplateAlias: "o1",
            }),
          ]),
        ],
      ),
    ]),
    el("Templates", {}, [el("RibbonTemplates", { Id: "Mscrm.RTE.Templates" })]),
    el("CommandDefinitions", {}, [
      el("CommandDefinition", { Id: "new.account.Hello.Command" }, [
        el("EnableRules", {}, [el("EnableRule", { Id: "Mscrm.Enabled" })]),
        el("DisplayRules", {}, [el("DisplayRule", { Id: "new.account.IsOwner" })]),
        el("Actions", {}, [
          el("JavaScriptFunction", { FunctionName: "hello", Library: "$webresource:new_/scripts/hello.js" }, [
            el("CrmParameter", { Value: "PrimaryControl" }),
          ]),
        ]),
      ]),
    ]),
    el("RuleDefinitions", {}, [
      el("TabDisplayRules"),
      el("DisplayRules", {}, [
        el("DisplayRule", { Id: "new.account.IsOwner" }, [
          el("EntityPrivilegeRule", { PrivilegeType: "Write", PrivilegeDepth: "Basic", AppliesTo: "PrimaryEntity" }),
        ]),
      ]),
      el("EnableRules"),
    ]),
    el("LocLabels", {}, [
      el("LocLabel", { Id: "new.account.Hello.Label" }, [
        el("Titles", {}, [el("Title", { languagecode: "1033", description: "Hello" })]),
      ]),
    ]),
  ]);
}

export function emptyAppDiff(): RibbonNode {
  return el("RibbonDiffXml", {}, [
    el("CustomActions"),
    el("Templates", {}, [el("RibbonTemplates", { Id: "Mscrm.RTE.Templates" })]),
    el("CommandDefinitions"),
    el("RuleDefinitions", {}, [el("TabDisplayRules"), el("DisplayRules"), el("EnableRules")]),
    el("LocLabels"),
  ]);
}

export const ruleTypesFixture: RuleType[] = [
  { name: "FormStateRule", usage: ["enable", "display"], attributes: [
    { name: "State", kind: "enum", required: true, values: ["Create", "Existing"] },
    { name: "Default", kind: "bool", required: false, values: null },
    { name: "InvertResult", kind: "bool", required: false, values: null },
  ] },
  { name: "EntityPrivilegeRule", usage: ["display"], attributes: [
    { name: "PrivilegeType", kind: "enum", required: true, values: ["Read", "Write"] },
    { name: "PrivilegeDepth", kind: "enum", required: true, values: ["Basic", "Global"] },
    { name: "AppliesTo", kind: "enum", required: false, values: ["PrimaryEntity", "SelectedEntity"] },
    { name: "InvertResult", kind: "bool", required: false, values: null },
  ] },
  { name: "OrRule", usage: ["enable", "display"], attributes: [] },
];

export function loadFixture(overrides: Partial<LoadResponse> = {}): LoadResponse {
  return {
    solution: solutionsFixture.solutions[0]!,
    entities: [
      { logicalName: "account", displayName: "Account", ribbonNotSupported: false, readOnlyReason: null, diff: accountDiff(), diffHash: "hash-account" },
      { logicalName: "contact", displayName: "Contact", ribbonNotSupported: false, readOnlyReason: "This table was added to the solution without its metadata.", diff: null, diffHash: null },
      { logicalName: "queue", displayName: "Queue", ribbonNotSupported: true, readOnlyReason: null, diff: el("RibbonDiffXml", {}, [el("RibbonNotSupported")]), diffHash: "hash-queue" },
    ],
    applicationRibbon: { included: true, readOnlyReason: null, diff: emptyAppDiff(), diffHash: "hash-app" },
    otherComponents: [],
    canPublish: true,
    readOnlyReason: null,
    ruleTypes: ruleTypesFixture,
    ...overrides,
  };
}

/** The published account ribbon. It already contains the solution's Hello button. */
export function accountBase(): BaseRibbon {
  return {
    entity: "account",
    tabs: [
      el("Tab", { Id: "Mscrm.HomepageGrid.account.MainTab", Title: "Accounts", Sequence: "10" }, [
        el("Scaling", { Id: "Mscrm.HomepageGrid.account.MainTab.Scaling" }),
        el("Groups", { Id: "Mscrm.HomepageGrid.account.MainTab.Groups" }, [
          el("Group", { Id: "Mscrm.HomepageGrid.account.MainTab.Actions", Title: "Actions", Sequence: "10", Template: "Mscrm.Templates.Flexible2" }, [
            el("Controls", { Id: "Mscrm.HomepageGrid.account.MainTab.Actions.Controls" }, [
              el("Button", { Id: "Mscrm.HomepageGrid.account.NewRecord", Command: "Mscrm.NewRecordFromGrid", LabelText: "New", Sequence: "10" }),
              el("Button", { Id: "new.account.Hello.Button", Command: "new.account.Hello.Command", LabelText: "$LocLabels:new.account.Hello.Label", Sequence: "30" }),
              el("Button", { Id: "Mscrm.HomepageGrid.account.Delete", Command: "Mscrm.DeleteSelectedRecord", LabelText: "Delete", Sequence: "20" }),
            ]),
          ]),
        ]),
      ]),
      el("Tab", { Id: "Mscrm.Form.account.MainTab", Title: "Account", Sequence: "10" }, [
        el("Groups", { Id: "Mscrm.Form.account.MainTab.Groups" }, [
          el("Group", { Id: "Mscrm.Form.account.MainTab.Save", Title: "Save", Sequence: "10" }, [
            el("Controls", { Id: "Mscrm.Form.account.MainTab.Save.Controls" }, [
              el("Button", { Id: "Mscrm.Form.account.Save", Command: "Mscrm.SavePrimary", LabelText: "Save", Sequence: "10" }),
            ]),
          ]),
        ]),
      ]),
    ],
    commands: [
      el("CommandDefinition", { Id: "Mscrm.NewRecordFromGrid" }, [
        el("EnableRules", {}, [el("EnableRule", { Id: "Mscrm.Enabled" })]),
        el("DisplayRules"),
        el("Actions", {}, [el("JavaScriptFunction", { FunctionName: "XrmCore.Commands.Open.openNewRecord", Library: "$webresource:Main_system_library.js" })]),
      ]),
      el("CommandDefinition", { Id: "Mscrm.DeleteSelectedRecord" }, [el("EnableRules"), el("DisplayRules"), el("Actions")]),
      el("CommandDefinition", { Id: "new.account.Hello.Command" }, [el("EnableRules"), el("DisplayRules"), el("Actions")]),
    ],
    enableRules: [el("EnableRule", { Id: "Mscrm.Enabled" }, [el("FormStateRule", { State: "Existing" })])],
    displayRules: [el("DisplayRule", { Id: "Mscrm.CanDeletePrimary" }, [el("EntityPrivilegeRule", { PrivilegeType: "Write", PrivilegeDepth: "Basic" })])],
    templates: [{ id: "Mscrm.Templates.Flexible2", layouts: ["LargeMedium", "LargeSmall"] }],
  };
}

export function applicationBase(): BaseRibbon {
  return {
    entity: null,
    tabs: [
      el("Tab", { Id: "Mscrm.BasicHomeTab", Title: "Home", Sequence: "10" }, [
        el("Groups", { Id: "Mscrm.BasicHomeTab.Groups" }, [
          el("Group", { Id: "Mscrm.BasicHomeTab.Tools", Title: "Tools", Sequence: "10" }, [
            el("Controls", { Id: "Mscrm.BasicHomeTab.Tools.Controls" }, [
              el("Button", { Id: "Mscrm.BasicHomeTab.Tools.Advanced", Command: "Mscrm.OpenAdvancedFind", LabelText: "Advanced find", Sequence: "10" }),
            ]),
          ]),
        ]),
      ]),
    ],
    commands: [el("CommandDefinition", { Id: "Mscrm.OpenAdvancedFind" }, [el("EnableRules"), el("DisplayRules"), el("Actions")])],
    enableRules: [],
    displayRules: [],
    templates: [],
  };
}

export function job(overrides: Partial<PublishJob> = {}): PublishJob {
  return {
    status: "succeeded",
    phase: "done",
    progress: 100,
    message: null,
    errors: [],
    warnings: [],
    targets: { entities: ["account"], applicationRibbon: false },
    ...overrides,
  };
}
