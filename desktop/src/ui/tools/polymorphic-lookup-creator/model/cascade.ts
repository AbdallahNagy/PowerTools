import type { CascadeAction, CascadeBehavior, CascadeDto, CascadeSettings, MenuBehavior, MenuGroup } from "./types";

export const cascadeBehaviors: Array<{ value: CascadeBehavior; label: string }> = [
  { value: "Parental", label: "Parental" },
  { value: "Referential", label: "Referential" },
  { value: "ReferentialRestrictDelete", label: "Referential, restrict delete" },
  { value: "Custom", label: "Custom" },
];

export const cascadeActionOptions = {
  assign: [
    { value: "Cascade" as const, label: "Cascade" },
    { value: "Active" as const, label: "Active" },
    { value: "UserOwned" as const, label: "Owner" },
    { value: "NoCascade" as const, label: "None" },
  ],
  delete: [
    { value: "Cascade" as const, label: "All" },
    { value: "RemoveLink" as const, label: "Remove link" },
    { value: "Restrict" as const, label: "Restrict" },
    { value: "NoCascade" as const, label: "None" },
  ],
  rollupView: [
    { value: "Cascade" as const, label: "Cascade" },
    { value: "NoCascade" as const, label: "None" },
  ],
};

export const cascadeFields: Array<{
  key: keyof CascadeSettings;
  label: string;
  options: Array<{ value: CascadeAction; label: string }>;
}> = [
  { key: "assign", label: "Assign", options: cascadeActionOptions.assign },
  { key: "share", label: "Share", options: cascadeActionOptions.assign },
  { key: "unshare", label: "Unshare", options: cascadeActionOptions.assign },
  { key: "reparent", label: "Reparent", options: cascadeActionOptions.assign },
  { key: "merge", label: "Merge", options: cascadeActionOptions.assign },
  { key: "delete", label: "Delete", options: cascadeActionOptions.delete },
  { key: "rollupView", label: "Rollup view", options: cascadeActionOptions.rollupView },
];

export function referentialCascade(): CascadeSettings {
  return {
    assign: "NoCascade",
    delete: "RemoveLink",
    merge: "NoCascade",
    reparent: "NoCascade",
    share: "NoCascade",
    unshare: "NoCascade",
    rollupView: "NoCascade",
  };
}

export function parentalCascade(): CascadeSettings {
  return {
    assign: "Cascade",
    delete: "Cascade",
    merge: "Cascade",
    reparent: "Cascade",
    share: "Cascade",
    unshare: "Cascade",
    rollupView: "NoCascade",
  };
}

export function referentialRestrictCascade(): CascadeSettings {
  return {
    ...referentialCascade(),
    delete: "Restrict",
  };
}

export function presetCascade(behavior: Exclude<CascadeBehavior, "Custom">): CascadeSettings {
  if (behavior === "Parental") return parentalCascade();
  if (behavior === "ReferentialRestrictDelete") return referentialRestrictCascade();
  return referentialCascade();
}

export function classifyCascade(cascade: CascadeSettings): CascadeBehavior {
  if (sameCascade(cascade, parentalCascade())) return "Parental";
  if (sameCascade(cascade, referentialRestrictCascade())) return "ReferentialRestrictDelete";
  if (sameCascade(cascade, referentialCascade())) return "Referential";
  return "Custom";
}

export function sameCascade(left: CascadeSettings, right: CascadeSettings): boolean {
  return cascadeFields.every((field) => left[field.key] === right[field.key]);
}

export function cascadeFromDto(cascade: CascadeDto | null | undefined): CascadeSettings {
  const fallback = referentialCascade();
  if (!cascade) return fallback;
  return {
    assign: parseAction(cascade.assign, cascadeActionOptions.assign, fallback.assign),
    share: parseAction(cascade.share, cascadeActionOptions.assign, fallback.share),
    unshare: parseAction(cascade.unshare, cascadeActionOptions.assign, fallback.unshare),
    reparent: parseAction(cascade.reparent, cascadeActionOptions.assign, fallback.reparent),
    merge: parseAction(cascade.merge, cascadeActionOptions.assign, fallback.merge),
    delete: parseAction(cascade.delete, cascadeActionOptions.delete, fallback.delete),
    rollupView: parseAction(cascade.rollupView, cascadeActionOptions.rollupView, fallback.rollupView),
  };
}

function parseAction(
  value: string | null | undefined,
  options: Array<{ value: CascadeAction }>,
  fallback: CascadeAction,
): CascadeAction {
  return options.some((option) => option.value === value) ? (value as CascadeAction) : fallback;
}

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
