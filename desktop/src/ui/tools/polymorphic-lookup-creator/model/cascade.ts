import type { CascadeSettings, MenuBehavior, MenuGroup } from "./types";

export const polymorphicCascade = (): CascadeSettings => ({
  assign: "NoCascade",
  delete: "RemoveLink",
  merge: "NoCascade",
  reparent: "NoCascade",
  share: "NoCascade",
  unshare: "NoCascade",
  rollupView: "NoCascade",
});

export const cascadeFields = [
  { key: "assign", label: "Assign", value: "NoCascade", option: "No cascade" },
  { key: "merge", label: "Merge", value: "NoCascade", option: "No cascade" },
  { key: "reparent", label: "Reparent", value: "NoCascade", option: "No cascade" },
  { key: "share", label: "Share", value: "NoCascade", option: "No cascade" },
  { key: "unshare", label: "Unshare", value: "NoCascade", option: "No cascade" },
  { key: "rollupView", label: "Rollup view", value: "NoCascade", option: "No cascade" },
  { key: "delete", label: "Delete", value: "RemoveLink", option: "Remove link" },
] as const;

export const menuBehaviors: Array<{ value: MenuBehavior; label: string }> = [
  { value: "UseCollectionName", label: "Use plural name" },
  { value: "UseLabel", label: "Custom label" },
  { value: "DoNotDisplay", label: "Do not display" },
];

export const menuGroups: Array<{ value: MenuGroup; label: string }> = [
  { value: "Details", label: "Details" },
  { value: "Sales", label: "Sales" },
  { value: "Service", label: "Service" },
  { value: "Marketing", label: "Marketing" },
];

export function parseMenuBehavior(value: string | null | undefined): MenuBehavior {
  return menuBehaviors.some((item) => item.value === value)
    ? (value as MenuBehavior)
    : "UseCollectionName";
}

export function parseMenuGroup(value: string | null | undefined): MenuGroup {
  return menuGroups.some((item) => item.value === value) ? (value as MenuGroup) : "Details";
}

export function isElasticTable(tableType: string | null | undefined): boolean {
  return tableType?.toLowerCase() === "elastic";
}
