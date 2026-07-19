import type { EntityInfo, FilterGroup, FieldMetadata, RelationshipMetadata } from "../model/types";
import type { ValidationError } from "../model/validation";
import type { useFilterTree } from "../hooks/useFilterTree";
import { GroupNode } from "./GroupNode";
import { DragProvider } from "./DragContext";

type TreeActions = ReturnType<typeof useFilterTree>;

interface FilterTreeProps {
  root: FilterGroup;
  fields: FieldMetadata[];
  rootEntity: EntityInfo;
  connectionName: string | null;
  tables: EntityInfo[];
  relationships: RelationshipMetadata[];
  errors: ValidationError[];
  actions: TreeActions;
}

export function FilterTree({
  root,
  fields,
  rootEntity,
  connectionName,
  tables,
  relationships,
  errors,
  actions,
}: FilterTreeProps) {
  return (
    <div className="w-fit max-w-full flex flex-col gap-3 p-3 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm overflow-x-auto">
      <DragProvider root={root}>
        <GroupNode
          group={root}
          fields={fields}
          rootEntity={rootEntity}
          connectionName={connectionName}
          tables={tables}
          relationships={relationships}
          errors={errors}
          depth={0}
          isRoot
          actions={actions}
        />
      </DragProvider>
    </div>
  );
}
