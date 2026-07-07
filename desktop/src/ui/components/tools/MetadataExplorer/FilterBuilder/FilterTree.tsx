import type { FilterGroup, FieldMetadata } from "../model/types";
import type { ValidationError } from "../model/validation";
import type { useFilterTree } from "../hooks/useFilterTree";
import { GroupNode } from "./GroupNode";
import { DragProvider } from "./DragContext";

type TreeActions = ReturnType<typeof useFilterTree>;

interface FilterTreeProps {
  root: FilterGroup;
  fields: FieldMetadata[];
  errors: ValidationError[];
  actions: TreeActions;
}

export function FilterTree({ root, fields, errors, actions }: FilterTreeProps) {
  return (
    <div className="flex flex-col gap-3 p-3 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm overflow-auto">
      <DragProvider root={root}>
        <GroupNode
          group={root}
          fields={fields}
          errors={errors}
          depth={0}
          isRoot
          actions={actions}
        />
      </DragProvider>
    </div>
  );
}
