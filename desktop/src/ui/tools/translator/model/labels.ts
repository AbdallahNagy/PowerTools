import type { LabelKey, LabelKind, LabelProperty, LabelRow, Language } from "./types";

/** Scope id of the Global choices row. Not a valid table logical name. */
export const GLOBAL_SCOPE = "#global";

export type ComponentTab =
  | "table"
  | "columns"
  | "choices"
  | "boolean"
  | "relationships"
  | "views"
  | "charts"
  | "global";

export interface TabDefinition {
  tab: ComponentTab;
  title: string;
  kind: LabelKind;
  /** "Loading {noun}…" */
  noun: string;
  /** Status bar: "account: 143 columns". */
  countNoun: string;
  emptyMessage: string;
}

export const TABLE_TABS: readonly TabDefinition[] = [
  {
    tab: "table",
    title: "Table",
    kind: "table",
    noun: "table labels",
    countNoun: "labels",
    emptyMessage: "This table has no labels.",
  },
  {
    tab: "columns",
    title: "Columns",
    kind: "column",
    noun: "column labels",
    countNoun: "columns",
    emptyMessage: "This table has no columns to translate.",
  },
  {
    tab: "choices",
    title: "Choices",
    kind: "choice",
    noun: "choice labels",
    countNoun: "choice columns",
    emptyMessage: "This table has no local choice columns.",
  },
  {
    tab: "boolean",
    title: "Yes/No",
    kind: "boolean",
    noun: "Yes/No labels",
    countNoun: "Yes/No columns",
    emptyMessage: "This table has no Yes/No columns.",
  },
  {
    tab: "relationships",
    title: "Relationships",
    kind: "relationship",
    noun: "relationship labels",
    countNoun: "relationships",
    emptyMessage: "No relationships on this table use a custom menu label.",
  },
  {
    tab: "views",
    title: "Views",
    kind: "view",
    noun: "view labels",
    countNoun: "views",
    emptyMessage: "This table has no system views.",
  },
  {
    tab: "charts",
    title: "Charts",
    kind: "chart",
    noun: "chart labels",
    countNoun: "charts",
    emptyMessage: "This table has no system charts.",
  },
];

export const GLOBAL_TAB: TabDefinition = {
  tab: "global",
  title: "Global choices",
  kind: "globalChoice",
  noun: "global choice labels",
  countNoun: "choices",
  emptyMessage: "This environment has no global choices.",
};

export function tabDefinition(tab: ComponentTab): TabDefinition {
  return tab === "global" ? GLOBAL_TAB : TABLE_TABS.find((item) => item.tab === tab) ?? TABLE_TABS[0]!;
}

export function isDescription(property: LabelProperty): boolean {
  return property === "Description" || property === "description";
}

/** Names Dataverse requires in the base language. */
export function isName(property: LabelProperty): boolean {
  return !isDescription(property);
}

/** The text of the Label column, such as "Plural Name" or "True Label". */
export function labelName(row: Pick<LabelRow, "key" | "booleanSet">): string {
  const { kind, property, value } = row.key;
  switch (kind) {
    case "table":
      return property === "DisplayName"
        ? "Display Name"
        : property === "DisplayCollectionName"
          ? "Plural Name"
          : "Description";
    case "column":
      return property === "DisplayName" ? "Display Name" : "Description";
    case "choice":
      return property === "Label" ? "Option Label" : "Option Description";
    case "boolean":
      return value === 1 ? "True Label" : "False Label";
    case "relationship":
      return "Menu Label";
    case "view":
    case "chart":
      return property === "name" ? "Name" : "Description";
    case "globalChoice":
      if (value == null) return property === "DisplayName" ? "Display Name" : "Description";
      if (row.booleanSet && property === "Label") return value === 1 ? "True Label" : "False Label";
      return property === "Label" ? "Option Label" : "Option Description";
  }
}

const LABEL_ORDER = [
  "Display Name",
  "Plural Name",
  "Description",
  "Option Label",
  "Option Description",
  "True Label",
  "False Label",
  "Menu Label",
  "Name",
];

/** Default order of labels within one component, as the UX lists them. */
export function labelOrder(row: Pick<LabelRow, "key" | "booleanSet">): number {
  const name = labelName(row);
  if (row.key.kind === "view" || row.key.kind === "chart") return name === "Name" ? 0 : 1;
  const index = LABEL_ORDER.indexOf(name);
  return index === -1 ? LABEL_ORDER.length : index;
}

/** Stable id for a row key. Field order is fixed so equal keys give equal ids. */
export function rowId(key: LabelKey): string {
  return [
    key.kind,
    key.table ?? "",
    key.column ?? "",
    key.optionSet ?? "",
    key.value ?? "",
    (key.recordId ?? "").toLowerCase(),
    key.relationship ?? "",
    key.side ?? "",
    key.property,
  ].join("|");
}

export function cellId(id: string, lcid: number): string {
  return `${id}@${lcid}`;
}

export function scopeOf(key: LabelKey): string {
  return key.kind === "globalChoice" ? GLOBAL_SCOPE : (key.table ?? "");
}

export function tabOf(key: LabelKey): ComponentTab {
  if (key.kind === "globalChoice") return "global";
  return TABLE_TABS.find((item) => item.kind === key.kind)?.tab ?? "table";
}

export function languageHeader(language: Language): string {
  return language.name === `LCID ${language.lcid}` ? language.name : `${language.name} (${language.lcid})`;
}

/** Base language first, then by name. */
export function orderLanguages(languages: readonly Language[], baseLcid: number): Language[] {
  return [...languages].sort((left, right) => {
    if (left.lcid === baseLcid) return -1;
    if (right.lcid === baseLcid) return 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.lcid - right.lcid;
  });
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
