export interface EntityPickerOption {
  id: string;
  logicalName: string;
  displayName: string;
  secondaryLogicalName: string | null;
  secondaryDisplayName: string | null;
  unavailable?: boolean;
}

export function entityDisplayName(option: Pick<EntityPickerOption, "displayName" | "secondaryDisplayName" | "logicalName" | "secondaryLogicalName">) {
  const primary = option.displayName || option.logicalName;
  const secondary = option.secondaryDisplayName || option.secondaryLogicalName;
  return secondary ? `${primary} · ${secondary}` : primary;
}

export function entityLogicalName(option: Pick<EntityPickerOption, "logicalName" | "secondaryLogicalName">) {
  return option.secondaryLogicalName ? `${option.logicalName} · ${option.secondaryLogicalName}` : option.logicalName;
}

export function entityOptionLabel(option: EntityPickerOption) {
  const suffix = option.unavailable ? " (unavailable)" : "";
  return `${entityDisplayName(option)} ${entityLogicalName(option)}${suffix}`;
}

export function entitySearchText(option: EntityPickerOption) {
  return `${entityDisplayName(option)} ${entityLogicalName(option)}`.toLocaleLowerCase();
}
