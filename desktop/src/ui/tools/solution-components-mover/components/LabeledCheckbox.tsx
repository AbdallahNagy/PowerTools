import { Checkbox } from "../../../shared/ui";

export function LabeledCheckbox({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Checkbox checked={checked} disabled={disabled} onChange={onChange} />
      <span className="sr-only">{label}</span>
    </label>
  );
}
