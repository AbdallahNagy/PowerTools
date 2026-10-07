import { Checkbox } from "../../../shared/ui";
import { cascadeBehaviors, cascadeFields, menuBehaviors, menuGroups, presetCascade } from "../model/cascade";
import { splitSchema } from "../model/schemaName";
import type { CascadeBehavior, RelationshipDraft } from "../model/types";
import { SchemaField, ToolSelect, ToolTextInput } from "./ToolField";

/** Settings for one relationship of the lookup. */
export function RelationshipFields({
  draft,
  disabled,
  onChange,
}: {
  draft: RelationshipDraft;
  disabled: boolean;
  onChange: (patch: Partial<RelationshipDraft>) => void;
}) {
  const split = splitSchema(draft.schemaName);
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <SchemaField
        id="relationship-schema-name"
        label="Relationship schema name"
        prefix={split.prefix}
        fragment={draft.saved ? split.fragment : draft.fragment}
        readOnly={draft.saved || disabled}
        onChange={
          draft.saved
            ? undefined
            : (value) => onChange({ fragment: value, fragmentEdited: true })
        }
      />
      <label className="flex items-center gap-2 text-sm text-fg">
        <Checkbox
          id="advanced-find"
          checked={draft.isValidForAdvancedFind}
          disabled={disabled}
          onChange={(checked) => onChange({ isValidForAdvancedFind: checked })}
        />
        Advanced Find
      </label>
      <ToolSelect
        id="menu-behavior"
        label="Associated menu"
        value={draft.menuBehavior}
        options={menuBehaviors}
        disabled={disabled}
        onChange={(value) => onChange({ menuBehavior: value as RelationshipDraft["menuBehavior"] })}
      />
      <ToolSelect
        id="menu-group"
        label="Display zone"
        value={draft.menuGroup}
        options={menuGroups}
        disabled={disabled}
        onChange={(value) => onChange({ menuGroup: value as RelationshipDraft["menuGroup"] })}
      />
      <ToolTextInput
        id="menu-order"
        label="Display order"
        value={String(draft.menuOrder)}
        readOnly={disabled}
        onChange={(value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;
          onChange({ menuOrder: Math.min(99999, Math.max(10000, parsed)) });
        }}
      />
      <ToolTextInput
        id="menu-label"
        label="Custom label"
        value={draft.menuLabel}
        readOnly={disabled}
        onChange={(value) => onChange({ menuLabel: value })}
      />
      <ToolSelect
        id="cascade-behavior"
        label="Cascade behavior"
        value={draft.cascadeBehavior}
        options={cascadeBehaviors}
        disabled={disabled}
        onChange={(value) => {
          const behavior = value as CascadeBehavior;
          onChange(
            behavior === "Custom"
              ? { cascadeBehavior: behavior }
              : { cascadeBehavior: behavior, cascade: presetCascade(behavior) },
          );
        }}
      />
      {draft.cascadeBehavior === "Custom" ? (
        <div className="grid grid-cols-2 gap-2">
          {cascadeFields.map((field) => (
            <ToolSelect
              key={field.key}
              id={`cascade-${field.key}`}
              label={field.label}
              value={draft.cascade[field.key]}
              disabled={disabled}
              options={field.options}
              onChange={(value) =>
                onChange({
                  cascadeBehavior: "Custom",
                  cascade: {
                    ...draft.cascade,
                    [field.key]: value as RelationshipDraft["cascade"]["assign"],
                  },
                })
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
