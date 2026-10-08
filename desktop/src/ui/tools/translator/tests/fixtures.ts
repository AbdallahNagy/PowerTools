import type { ApplyJob, LabelRow, LanguagesResponse, TableInfo } from "../model/types";

export const languagesFixture: LanguagesResponse = {
  baseLcid: 1033,
  languages: [
    { lcid: 1033, name: "English" },
    { lcid: 1036, name: "French" },
    { lcid: 1031, name: "German" },
  ],
};

export const tablesFixture: TableInfo[] = [
  {
    logicalName: "account",
    displayName: "Account",
    primaryIdAttribute: "accountid",
    primaryNameAttribute: "name",
    isCustom: false,
  },
  {
    logicalName: "contact",
    displayName: "Contact",
    primaryIdAttribute: "contactid",
    primaryNameAttribute: "fullname",
    isCustom: false,
  },
];

function row(partial: Partial<LabelRow> & Pick<LabelRow, "key" | "component">): LabelRow {
  return {
    componentName: null,
    detail: null,
    booleanSet: false,
    readOnlyReason: null,
    labels: {},
    ...partial,
  };
}

export const accountTableRows: LabelRow[] = [
  row({
    key: { kind: "table", table: "account", property: "DisplayName" },
    component: "Account",
    componentName: "account",
    labels: { "1033": "Account", "1036": "Compte" },
  }),
  row({
    key: { kind: "table", table: "account", property: "DisplayCollectionName" },
    component: "Account",
    componentName: "account",
    labels: { "1033": "Accounts" },
  }),
  row({
    key: { kind: "table", table: "account", property: "Description" },
    component: "Account",
    componentName: "account",
    labels: { "1033": "Business that represents a customer." },
  }),
];

export const accountColumnRows: LabelRow[] = [
  row({
    key: { kind: "column", table: "account", column: "name", property: "DisplayName" },
    component: "Account Name",
    componentName: "name",
    labels: { "1033": "Account Name", "1036": "Nom du compte" },
  }),
  row({
    key: { kind: "column", table: "account", column: "name", property: "Description" },
    component: "Account Name",
    componentName: "name",
    labels: {},
  }),
  row({
    key: { kind: "column", table: "account", column: "createdon", property: "DisplayName" },
    component: "Created On",
    componentName: "createdon",
    readOnlyReason: "This column cannot be renamed.",
    labels: { "1033": "Created On" },
  }),
];

export const globalRows: LabelRow[] = [
  row({
    key: { kind: "globalChoice", optionSet: "new_color", property: "DisplayName" },
    component: "Color",
    componentName: "new_color",
    labels: { "1033": "Color" },
  }),
  row({
    key: { kind: "globalChoice", optionSet: "new_color", value: 1, property: "Label" },
    component: "Color",
    componentName: "new_color",
    labels: { "1033": "Red" },
  }),
  row({
    key: { kind: "globalChoice", optionSet: "new_flag", value: 1, property: "Label" },
    component: "Flag",
    componentName: "new_flag",
    booleanSet: true,
    labels: { "1033": "Yes" },
  }),
];

export function completedJob(partial: Partial<ApplyJob> = {}): ApplyJob {
  return {
    status: "completed",
    phase: "done",
    processed: 0,
    total: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    results: [],
    publish: { status: "succeeded", targets: { tables: ["account"], optionSets: [] }, message: null },
    log: [],
    ...partial,
  };
}
