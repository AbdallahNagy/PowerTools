import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button, Field, Input, Select } from "../../../../shared/ui";
import { LOC_LABELS } from "../../model/commandBar";

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

export function IconButton({ label, onClick, disabled, children }: IconButtonProps) {
  return (
    <Button variant="ghost" size="sm" className="px-1" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

interface RowControlsProps {
  name: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

/** Move up, move down, and remove buttons for one row of an ordered list. */
export function RowControls({ name, index, count, disabled, onMove, onRemove }: RowControlsProps) {
  return (
    <>
      <IconButton label={`Move ${name} up`} disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)}>
        <ArrowUp size={14} aria-hidden="true" />
      </IconButton>
      <IconButton label={`Move ${name} down`} disabled={disabled || index === count - 1} onClick={() => onMove(index, index + 1)}>
        <ArrowDown size={14} aria-hidden="true" />
      </IconButton>
      <IconButton label={`Remove ${name}`} disabled={disabled} onClick={() => onRemove(index)}>
        <X size={14} aria-hidden="true" />
      </IconButton>
    </>
  );
}

interface TextOrLabelProps {
  label: string;
  value: string | null;
  labelIds: readonly string[];
  disabled: boolean;
  onChange: (value: string | null) => void;
}

/** Plain text, or a reference to one of the solution's labels. */
export function TextOrLabel({ label, value, labelIds, disabled, onChange }: TextOrLabelProps) {
  const isLabel = value?.startsWith(LOC_LABELS) ?? false;
  const reference = isLabel ? value!.slice(LOC_LABELS.length) : "";
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Select
          aria-label={`${label} source`}
          className="w-24 shrink-0"
          value={isLabel ? "label" : "text"}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value === "label" ? `${LOC_LABELS}${labelIds[0] ?? ""}` : "")
          }
        >
          <option value="text">Text</option>
          <option value="label">Label</option>
        </Select>
        {isLabel ? (
          <Select
            aria-label={`${label} label`}
            className="min-w-0 flex-1 font-mono"
            value={reference}
            disabled={disabled}
            onChange={(event) => onChange(`${LOC_LABELS}${event.target.value}`)}
          >
            {!labelIds.includes(reference) ? <option value={reference}>{reference || "Choose a label"}</option> : null}
            {labelIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            aria-label={label}
            className="min-w-0 flex-1"
            value={value ?? ""}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </div>
    </Field>
  );
}
