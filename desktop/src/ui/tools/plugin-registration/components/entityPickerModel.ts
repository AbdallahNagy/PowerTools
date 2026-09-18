export interface EntityPickerOption {
  id: string;
  logicalName: string;
  displayName: string;
  secondaryLogicalName: string | null;
  secondaryDisplayName: string | null;
  unavailable?: boolean;
}

export interface EntityPickerFilter {
  id: string;
  primaryTable: string;
  secondaryTable: string | null;
}

type EntityNameLookup = { logicalName: string; displayName: string };

export function isPresentTable(value: string | null | undefined): value is string {
  const trimmed = value?.trim();
  return Boolean(trimmed && trimmed.toLowerCase() !== "none");
}

export function entityDisplayName(option: Pick<EntityPickerOption, "displayName" | "secondaryDisplayName" | "logicalName" | "secondaryLogicalName">) {
  const primary = option.displayName || option.logicalName;
  const secondary = isPresentTable(option.secondaryDisplayName)
    ? option.secondaryDisplayName
    : isPresentTable(option.secondaryLogicalName)
      ? option.secondaryLogicalName
      : null;
  return secondary ? `${primary} · ${secondary}` : primary;
}

export function entityLogicalName(option: Pick<EntityPickerOption, "logicalName" | "secondaryLogicalName">) {
  return isPresentTable(option.secondaryLogicalName)
    ? `${option.logicalName} · ${option.secondaryLogicalName}`
    : option.logicalName;
}

export function entityOptionLabel(option: EntityPickerOption) {
  const suffix = option.unavailable ? " (unavailable)" : "";
  return `${entityDisplayName(option)} ${entityLogicalName(option)}${suffix}`;
}

export function entitySearchText(option: EntityPickerOption) {
  return `${entityDisplayName(option)} ${entityLogicalName(option)}`.toLocaleLowerCase();
}

export function toEntityOption(
  id: string,
  primaryTable: string,
  secondaryTable: string | null,
  entities: Map<string, EntityNameLookup>,
  unavailable = false,
): EntityPickerOption {
  const presentPrimary = isPresentTable(primaryTable) ? primaryTable : null;
  const presentSecondary = isPresentTable(secondaryTable) ? secondaryTable : null;
  const logicalName = presentPrimary ?? presentSecondary ?? "none";
  const related = presentPrimary && presentSecondary ? presentSecondary : null;
  const primary = entities.get(logicalName.toLowerCase());
  const secondary = related ? entities.get(related.toLowerCase()) : undefined;
  return {
    id,
    logicalName,
    displayName: primary?.displayName || (logicalName === "none" ? "None" : logicalName),
    secondaryLogicalName: related,
    secondaryDisplayName: secondary?.displayName || related,
    unavailable,
  };
}

export function buildEntityPickerOptions(
  filters: EntityPickerFilter[],
  entities: Map<string, EntityNameLookup>,
  current?: EntityPickerOption | null,
): EntityPickerOption[] {
  const real: EntityPickerOption[] = [];
  const seen = new Set<string>();
  const unbound: { option: EntityPickerOption | null } = { option: null };

  const add = (option: EntityPickerOption) => {
    const key = `${option.logicalName.toLowerCase()}::${(option.secondaryLogicalName ?? "").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!isPresentTable(option.logicalName)) {
      unbound.option ??= option;
      return;
    }
    real.push(option);
  };

  if (current) add(current);
  for (const item of filters) {
    if (!item.primaryTable && !item.secondaryTable) continue;
    add(toEntityOption(item.id, item.primaryTable, item.secondaryTable, entities, false));
  }

  const noneOption = unbound.option;
  const rows = real.length > 0 && !noneOption?.unavailable
    ? real
    : noneOption
      ? [noneOption, ...real]
      : real;
  return rows.sort(compareEntityOptions);
}

function compareEntityOptions(left: EntityPickerOption, right: EntityPickerOption) {
  return entityDisplayName(left).localeCompare(entityDisplayName(right), undefined, { sensitivity: "base" });
}
