import { attributeTypeLabel, rawTypeName } from "./attributeType";
import { requiredLevelLabel } from "./requiredLevel";
import type { AttributeInfo, OptionInfo } from "./types";

export interface DetailRow {
  label: string;
  value: string;
  /** Secondary text shown next to the value, for example the raw type name. */
  muted?: string;
}

export interface DetailSection {
  id: "general" | "typeDetails" | "behavior";
  title: string;
  rows: DetailRow[];
}

export interface OptionsView {
  name: string | null;
  scope: "Global" | "Local" | null;
  options: OptionInfo[];
}

export interface RelatedTableView {
  logicalName: string;
  relationship: string | null;
}

const EMPTY = "—";

export function yesNo(value: boolean | null): string {
  if (value === null) return EMPTY;
  return value ? "Yes" : "No";
}

export function sourceLabel(sourceType: number | null): string | null {
  switch (sourceType) {
    case null:
      return null;
    case 0:
      return "Simple";
    case 1:
      return "Calculated";
    case 2:
      return "Rollup";
    case 3:
      return "Formula";
    default:
      return String(sourceType);
  }
}

function present(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function visible(rows: Array<DetailRow | null>): DetailRow[] {
  return rows.filter((row): row is DetailRow => row !== null);
}

function row(label: string, value: string | number | null | undefined, muted?: string): DetailRow | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!present(text)) return null;
  return muted ? { label, value: text, muted } : { label, value: text };
}

function range(attribute: AttributeInfo): string | null {
  const { minValue, maxValue } = attribute;
  if (present(minValue) && present(maxValue)) return `${minValue} to ${maxValue}`;
  if (present(minValue)) return `Min ${minValue}`;
  if (present(maxValue)) return `Max ${maxValue}`;
  return null;
}

/** General, type details, and behavior rows. Empty rows and sections are left out. */
export function buildDetailSections(attribute: AttributeInfo): DetailSection[] {
  const typeLabel = attributeTypeLabel(attribute);
  const raw = rawTypeName(attribute);

  const general = visible([
    row("Type", typeLabel, raw === typeLabel ? undefined : raw),
    row("Required", requiredLevelLabel(attribute.requiredLevel)),
    row("Description", attribute.description),
    row("Origin", attribute.isCustom ? "Custom" : "System"),
    row("Managed state", attribute.isManaged ? "Managed" : "Unmanaged"),
    attribute.isPrimaryId ? row("Primary id", "Yes") : null,
    attribute.isPrimaryName ? row("Primary name", "Yes") : null,
    row("Source", sourceLabel(attribute.sourceType)),
    row("Introduced version", attribute.introducedVersion),
    row("Column number", attribute.columnNumber),
    row("Metadata id", attribute.metadataId),
  ]);

  const typeDetails = visible([
    row("Max length", attribute.maxLength),
    row("Format", attribute.format),
    row("Date and time behavior", attribute.dateTimeBehavior),
    row("Min / Max", range(attribute)),
    row("Precision", attribute.precision),
    row("Default value", attribute.defaultValue),
  ]);

  const behavior: DetailRow[] = [
    { label: "Valid for create", value: yesNo(attribute.isValidForCreate) },
    { label: "Valid for update", value: yesNo(attribute.isValidForUpdate) },
    { label: "Valid for read", value: yesNo(attribute.isValidForRead) },
    { label: "Valid for Advanced Find", value: yesNo(attribute.isValidForAdvancedFind) },
    { label: "Auditing enabled", value: yesNo(attribute.isAuditEnabled) },
    { label: "Field security", value: yesNo(attribute.isSecured) },
    { label: "Filterable", value: yesNo(attribute.isFilterable) },
    { label: "Retrievable", value: yesNo(attribute.isRetrievable) },
  ];

  const sections: DetailSection[] = [
    { id: "general", title: "General", rows: general },
    { id: "typeDetails", title: "Type details", rows: typeDetails },
    { id: "behavior", title: "Behavior", rows: behavior },
  ];
  return sections.filter((section) => section.rows.length > 0);
}

/** One entry per lookup target, paired with the relationship that points at it. */
export function relatedTables(attribute: AttributeInfo): RelatedTableView[] {
  const relationships = attribute.relationships ?? [];
  // Owner lookups have one relationship to "owner" rather than one per target.
  const shared = relationships.length === 1 ? relationships[0].schemaName : null;
  return (attribute.targets ?? []).map((target) => ({
    logicalName: target,
    relationship:
      relationships.find((item) => item.referencedEntity === target)?.schemaName ?? shared,
  }));
}

export function optionsView(attribute: AttributeInfo): OptionsView | null {
  if (attribute.optionSet) {
    return {
      name: attribute.optionSet.name,
      scope: attribute.optionSet.isGlobal ? "Global" : "Local",
      options: attribute.optionSet.options,
    };
  }

  if (attribute.booleanOptions) {
    const { trueLabel, falseLabel } = attribute.booleanOptions;
    return {
      name: null,
      scope: null,
      options: [
        { value: 1, label: trueLabel ?? "Yes" },
        { value: 0, label: falseLabel ?? "No" },
      ],
    };
  }

  return null;
}
