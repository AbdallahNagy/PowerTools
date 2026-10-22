import type { EntityInfo } from "../../../shared/contracts/dataverse";
import { createRelationshipPathSegment } from "./fetchxml";
import { isKnownOperator, MULTI_VALUE_OPERATORS, NO_VALUE_OPERATORS } from "./operators";
import type {
  FieldMetadata,
  FilterCondition,
  FilterGroup,
  FilterNode,
  FilterRelationship,
  Operator,
  RelationshipMetadata,
  RelationshipPathSegment,
} from "./types";

export interface ViewFilterContext {
  /** Columns of the view's table, used to drop conditions on columns it no longer has. */
  fields: FieldMetadata[];
  /** Relationships of the view's table, used to name related-table filters. */
  relationships: RelationshipMetadata[];
  tables: EntityInfo[];
}

export interface ViewFilterResult {
  root: FilterGroup;
  /** Parts of the view's filter the builder cannot edit, described for the user. */
  skipped: string[];
}

/**
 * Turns the filters of a view's FetchXML into an editable filter tree. Conditions on
 * related tables become related-table filters. Anything the builder cannot show, such
 * as an outer join with a filter, is left out and listed in `skipped`.
 */
export function parseViewFilters(fetchXml: string, context: ViewFilterContext): ViewFilterResult {
  const skipped: string[] = [];
  const doc = new DOMParser().parseFromString(fetchXml, "application/xml");
  const entity = doc.querySelector("fetch > entity");
  if (!entity || doc.querySelector("parsererror")) {
    return { root: emptyRoot(), skipped: fetchXml.trim() ? ["The view's FetchXML could not be read."] : [] };
  }

  const fieldNames = new Set(context.fields.map((field) => field.logicalName));
  const children = parseEntityChildren(entity, {
    entityName: entity.getAttribute("name") ?? "",
    depth: 0,
    parentPath: [],
    skipped,
    isKnownField: (name) => fieldNames.has(name),
    context,
  });

  return { root: children.length ? toRoot(children) : emptyRoot(), skipped };
}

interface ParseScope {
  entityName: string;
  depth: number;
  parentPath: RelationshipPathSegment[];
  skipped: string[];
  /** Only the view's own table has column metadata here; related tables are checked when they load. */
  isKnownField: (name: string) => boolean;
  context: ViewFilterContext;
}

function parseEntityChildren(element: Element, scope: ParseScope): FilterNode[] {
  const nodes: FilterNode[] = [];
  for (const child of Array.from(element.children)) {
    if (child.tagName === "filter") {
      const group = parseFilter(child, scope);
      if (group) nodes.push(group);
    } else if (child.tagName === "link-entity") {
      const relationship = parseLinkEntity(child, scope);
      if (relationship) nodes.push(relationship);
    }
  }
  return nodes;
}

function parseFilter(element: Element, scope: ParseScope): FilterGroup | null {
  const children: FilterNode[] = [];
  for (const child of Array.from(element.children)) {
    if (child.tagName === "condition") {
      const condition = parseCondition(child, scope);
      if (condition) children.push(condition);
    } else if (child.tagName === "filter") {
      const group = parseFilter(child, scope);
      if (group) children.push(group);
    } else if (child.tagName === "link-entity") {
      scope.skipped.push(`A related-table check on ${child.getAttribute("name") ?? "a table"} inside a filter`);
    }
  }
  if (!children.length) return null;
  return {
    id: uid(),
    kind: "group",
    logic: element.getAttribute("type") === "or" ? "or" : "and",
    children,
  };
}

function parseCondition(element: Element, scope: ParseScope): FilterCondition | null {
  const attribute = element.getAttribute("attribute") ?? "";
  const rawOperator = element.getAttribute("operator") ?? "";
  const describe = `${attribute || "?"} ${rawOperator}`.trim();

  if (element.hasAttribute("entityname")) {
    scope.skipped.push(`${describe} (refers to another table by alias)`);
    return null;
  }
  if (element.hasAttribute("valueof")) {
    scope.skipped.push(`${describe} (compares two columns)`);
    return null;
  }
  if (!attribute || !scope.isKnownField(attribute)) {
    scope.skipped.push(`${describe} (column not found)`);
    return null;
  }

  const condition: FilterCondition = {
    id: uid(),
    kind: "condition",
    field: attribute,
    fieldRef: { kind: "root", field: attribute },
    operator: null,
  };

  if (rawOperator === "like" || rawOperator === "not-like") {
    const mapped = mapLike(rawOperator, element.getAttribute("value") ?? "");
    if (!mapped) {
      scope.skipped.push(`${describe} (pattern the builder cannot show)`);
      return null;
    }
    return { ...condition, operator: mapped.operator, value: mapped.value };
  }

  if (!isKnownOperator(rawOperator)) {
    scope.skipped.push(`${describe} (operator not supported)`);
    return null;
  }
  const operator: Operator = rawOperator;
  condition.operator = operator;
  if (NO_VALUE_OPERATORS.includes(operator)) return condition;

  const uitype = element.getAttribute("uitype");
  const valueLabels: Record<string, string> = {};
  if (MULTI_VALUE_OPERATORS.includes(operator)) {
    const values: string[] = [];
    let lookupTarget = uitype ?? undefined;
    for (const valueElement of Array.from(element.getElementsByTagName("value"))) {
      const value = normalizeValue(valueElement.textContent ?? "");
      if (!value) continue;
      values.push(value);
      const label = valueElement.getAttribute("uiname");
      if (label) valueLabels[value] = label;
      lookupTarget = valueElement.getAttribute("uitype") ?? lookupTarget;
    }
    return withLookupDetails({ ...condition, value: values }, valueLabels, lookupTarget);
  }

  const value = normalizeValue(element.getAttribute("value") ?? element.querySelector("value")?.textContent ?? "");
  const label = element.getAttribute("uiname");
  if (label && value) valueLabels[value] = label;
  return withLookupDetails({ ...condition, value }, valueLabels, uitype ?? undefined);
}

function withLookupDetails(
  condition: FilterCondition,
  valueLabels: Record<string, string>,
  lookupTarget: string | undefined,
): FilterCondition {
  return {
    ...condition,
    ...(Object.keys(valueLabels).length ? { valueLabels } : {}),
    ...(lookupTarget ? { lookupTarget } : {}),
  };
}

/** Maps a FetchXML like pattern onto the builder's contains / begins / ends operators. */
export function mapLike(
  operator: "like" | "not-like",
  pattern: string,
): { operator: Operator; value: string } | null {
  const starts = pattern.startsWith("%");
  const ends = pattern.length > 1 && pattern.endsWith("%") && !pattern.endsWith("[%]");
  const inner = pattern.slice(starts ? 1 : 0, ends ? -1 : undefined);
  if (hasWildcard(inner)) return null;
  const value = unescapeLike(inner);
  if (operator === "not-like") return starts && ends ? { operator: "not-like", value } : null;
  if (starts && ends) return { operator: "like", value };
  if (ends) return { operator: "begins-with", value };
  if (starts) return { operator: "ends-with", value };
  return { operator: "eq", value };
}

function hasWildcard(value: string): boolean {
  return /[%_]/.test(value.replace(/\[[^\]]\]/g, ""));
}

function unescapeLike(value: string): string {
  return value.replace(/\[([^\]])\]/g, "$1");
}

function normalizeValue(raw: string): string {
  const value = raw.trim();
  // Lookup values are often written as {GUID}.
  const guid = /^\{([0-9a-fA-F-]{36})\}$/.exec(value);
  if (guid) return guid[1].toLowerCase();
  // The date box takes yyyy-mm-dd.
  const date = /^(\d{4}-\d{2}-\d{2})(T00:00:00(\.0+)?Z?)?$/.exec(value);
  if (date) return date[1];
  return value;
}

function parseLinkEntity(element: Element, scope: ParseScope): FilterRelationship | null {
  const name = element.getAttribute("name") ?? "";
  const from = element.getAttribute("from") ?? "";
  const to = element.getAttribute("to") ?? "";
  const linkType = element.getAttribute("link-type") ?? "inner";
  const hasFilters = element.querySelector("filter, condition") !== null;

  if (!hasFilters) return null;
  if (linkType !== "inner") {
    scope.skipped.push(`Filters on ${name} (${linkType} join)`);
    return null;
  }
  if (!name || !from || !to) {
    scope.skipped.push(`Filters on ${name || "a related table"}`);
    return null;
  }

  const id = uid();
  const segment = withScopeAlias(linkSegment(scope, name, from, to), id);
  const children = parseEntityChildren(element, {
    entityName: name,
    depth: scope.depth + 1,
    parentPath: [...scope.parentPath, segment],
    skipped: scope.skipped,
    isKnownField: () => true,
    context: scope.context,
  });
  if (!children.length) return null;

  return { id, kind: "relationship", relationship: segment, group: toRoot(children) };
}

function linkSegment(scope: ParseScope, name: string, from: string, to: string): RelationshipPathSegment {
  const { context } = scope;
  const target = context.tables.find((table) => table.logicalName === name);
  const known =
    scope.depth === 0
      ? context.relationships.find(
          (relationship) =>
            relationship.targetEntity === name &&
            relationship.sourceAttribute === to &&
            relationship.targetAttribute === from,
        )
      : undefined;
  const lookupName =
    scope.depth === 0
      ? context.fields.find((field) => field.logicalName === to)?.displayName ?? to
      : to;
  const label = `${lookupName} > ${target?.displayName ?? name}`;

  if (known) return createRelationshipPathSegment(known, scope.parentPath, label);
  return {
    relationshipSchemaName: `${scope.entityName}.${to}:${name}.${from}`,
    relationshipType: "many-to-one",
    sourceEntity: scope.entityName,
    targetEntity: name,
    sourceAttribute: to,
    targetAttribute: from,
    linkFromAttribute: from,
    linkToAttribute: to,
    alias: `rel_${scope.depth}_${name.replace(/[^a-zA-Z0-9_]/g, "_")}`,
    label,
  };
}

/**
 * Related-table filters must sit in an AND group, so a single AND filter becomes the
 * root itself and anything else is wrapped in one.
 */
function toRoot(children: FilterNode[]): FilterGroup {
  const groups = children.filter((child): child is FilterGroup => child.kind === "group");
  const [group] = groups;
  if (groups.length === 1 && group.logic === "and") {
    return { ...group, children: [...group.children, ...children.filter((child) => child !== group)] };
  }
  return { id: uid(), kind: "group", logic: "and", children };
}

function withScopeAlias(relationship: RelationshipPathSegment, id: string): RelationshipPathSegment {
  const suffix = id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return { ...relationship, alias: `${relationship.alias}_${suffix}` };
}

function emptyRoot(): FilterGroup {
  return {
    id: uid(),
    kind: "group",
    logic: "and",
    children: [{ id: uid(), kind: "condition", field: null, fieldRef: null, operator: null }],
  };
}

function uid(): string {
  return crypto.randomUUID();
}
