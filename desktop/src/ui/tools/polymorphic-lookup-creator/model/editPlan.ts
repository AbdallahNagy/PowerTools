import { polymorphicCascade } from "./cascade";
import { joinSchema, suggestSchemaFragment } from "./schemaName";
import type {
  EditPlan,
  LookupColumn,
  PolymorphicEntity,
  RelationshipDraft,
  RelationshipPayload,
} from "./types";

export function newRelationshipDraft(
  referenced: PolymorphicEntity,
  customizationPrefix: string,
): RelationshipDraft {
  const fragment = suggestSchemaFragment(referenced.displayName || referenced.logicalName);
  return {
    referencedLogicalName: referenced.logicalName,
    fragment,
    fragmentEdited: false,
    schemaName: joinSchema(customizationPrefix, fragment),
    saved: false,
    isValidForAdvancedFind: true,
    menuBehavior: "UseCollectionName",
    menuGroup: "Details",
    menuOrder: 10000,
    menuLabel: "",
  };
}

export function buildDrafts(
  entity: PolymorphicEntity,
  lookup: LookupColumn,
  entities: PolymorphicEntity[],
  customizationPrefix: string,
): RelationshipDraft[] {
  const targets = new Set(lookup.targets);
  entity.manyToOne.forEach((relationship) => {
    if (relationship.referencingAttribute === lookup.logicalName && relationship.referencedEntity) {
      targets.add(relationship.referencedEntity);
    }
  });

  return [...targets].map((target) => {
    const relationship = entity.manyToOne.find(
      (item) =>
        item.referencingAttribute === lookup.logicalName && item.referencedEntity === target,
    );
    if (!relationship) {
      const referenced = entities.find((item) => item.logicalName === target);
      return newRelationshipDraft(
        referenced ?? {
          ...entity,
          logicalName: target,
          displayName: target,
          schemaName: target,
        },
        customizationPrefix,
      );
    }

    const separator = relationship.schemaName.indexOf("_");
    const fragment =
      separator > 0 ? relationship.schemaName.slice(separator + 1) : relationship.schemaName;
    return {
      referencedLogicalName: target,
      schemaName: relationship.schemaName,
      fragment,
      fragmentEdited: true,
      saved: true,
      isValidForAdvancedFind: relationship.isValidForAdvancedFind,
      menuBehavior:
        relationship.associatedMenuBehavior === "UseLabel" ||
        relationship.associatedMenuBehavior === "DoNotDisplay"
          ? relationship.associatedMenuBehavior
          : "UseCollectionName",
      menuGroup:
        relationship.associatedMenuGroup === "Sales" ||
        relationship.associatedMenuGroup === "Service" ||
        relationship.associatedMenuGroup === "Marketing"
          ? relationship.associatedMenuGroup
          : "Details",
      menuOrder: relationship.associatedMenuOrder ?? 10000,
      menuLabel: relationship.associatedMenuLabel ?? "",
    };
  });
}

export function relationshipPayload(draft: RelationshipDraft): RelationshipPayload {
  return {
    referencedEntityLogicalName: draft.referencedLogicalName,
    schemaName: draft.schemaName,
    isValidForAdvancedFind: draft.isValidForAdvancedFind,
    cascade: polymorphicCascade(),
    associatedMenuBehavior: draft.menuBehavior,
    associatedMenuGroup: draft.menuGroup,
    associatedMenuOrder: draft.menuOrder,
    associatedMenuLabel: draft.menuLabel.trim() ? draft.menuLabel : null,
  };
}

function relationshipChanged(original: RelationshipDraft, current: RelationshipDraft): boolean {
  return (
    original.isValidForAdvancedFind !== current.isValidForAdvancedFind ||
    original.menuBehavior !== current.menuBehavior ||
    original.menuGroup !== current.menuGroup ||
    original.menuOrder !== current.menuOrder ||
    original.menuLabel !== current.menuLabel
  );
}

export function buildEditPlan(
  current: RelationshipDraft[],
  original: RelationshipDraft[],
): { plan: EditPlan | null; error: string | null } {
  if (current.length < 2) {
    return { plan: null, error: "Select at least two referenced tables." };
  }

  const originalByTarget = new Map(original.map((draft) => [draft.referencedLogicalName, draft]));
  const currentTargets = new Set(current.map((draft) => draft.referencedLogicalName));
  const adds = current.filter((draft) => !originalByTarget.has(draft.referencedLogicalName));
  const deletes = original.filter((draft) => !currentTargets.has(draft.referencedLogicalName));
  const updates = current.filter((draft) => {
    const previous = originalByTarget.get(draft.referencedLogicalName);
    return previous?.saved === true && relationshipChanged(previous, draft);
  });

  if (adds.length + deletes.length + updates.length === 0) {
    return { plan: null, error: "No changes to save." };
  }

  return { plan: { adds, deletes, updates }, error: null };
}

export function isExistingDirty(current: RelationshipDraft[], original: RelationshipDraft[]): boolean {
  if (current.length !== original.length) return true;
  const originalByTarget = new Map(original.map((draft) => [draft.referencedLogicalName, draft]));
  return current.some((draft) => {
    const previous = originalByTarget.get(draft.referencedLogicalName);
    if (!previous) return true;
    return relationshipChanged(previous, draft) || (!previous.saved && previous.schemaName !== draft.schemaName);
  });
}

export function canCreateLookup(input: {
  displayName: string;
  schemaName: string;
  referencedLogicalNames: string[];
  referencingLogicalName: string;
  solutionAware: boolean;
}): boolean {
  if (input.solutionAware) return false;
  if (!input.displayName.trim() || !input.schemaName) return false;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(input.schemaName)) return false;
  if (input.referencedLogicalNames.length < 2) return false;
  if (input.referencedLogicalNames.includes(input.referencingLogicalName)) return false;
  return new Set(input.referencedLogicalNames).size === input.referencedLogicalNames.length;
}

export function editOperationOrder(plan: EditPlan): Array<"add" | "delete" | "update"> {
  return [
    ...plan.adds.map(() => "add" as const),
    ...plan.deletes.map(() => "delete" as const),
    ...plan.updates.map(() => "update" as const),
  ];
}

export function managedLabel(isManaged: boolean | null): string {
  if (isManaged === true) return "Managed";
  if (isManaged === false) return "Unmanaged";
  return "Unknown";
}

export function lookupSignature(entity: PolymorphicEntity, lookup: LookupColumn): string {
  const relationships = entity.manyToOne
    .filter((item) => item.referencingAttribute === lookup.logicalName)
    .map((item) =>
      [
        item.schemaName,
        item.referencedEntity,
        String(item.isValidForAdvancedFind),
        item.associatedMenuBehavior,
        item.associatedMenuGroup,
        String(item.associatedMenuOrder),
        item.associatedMenuLabel ?? "",
      ].join(":"),
    )
    .sort();
  return [lookup.logicalName, lookup.schemaName, lookup.displayName, ...lookup.targets, ...relationships].join("|");
}
