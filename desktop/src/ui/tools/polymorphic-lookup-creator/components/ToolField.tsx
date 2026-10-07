import { Input, Select } from "../../../shared/ui";

export function ToolTextInput({
  id,
  label,
  value,
  onChange,
  readOnly = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-fg-muted" htmlFor={id}>
      {label}
      <Input
        id={id}
        aria-label={label}
        readOnly={readOnly}
        value={value}
        onChange={(event) => {
          if (!readOnly) onChange?.(event.target.value);
        }}
        className="bg-raised"
      />
    </label>
  );
}

export function ToolSelect({
  id,
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-fg-muted" htmlFor={id}>
      {label}
      <Select
        id={id}
        aria-label={label}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          if (!disabled) onChange?.(event.target.value);
        }}
        className="w-full [&>select]:bg-raised"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function SchemaField({
  id,
  label,
  prefix,
  fragment,
  readOnly,
  onChange,
}: {
  id: string;
  label: string;
  prefix: string;
  fragment: string;
  readOnly: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-fg-muted" htmlFor={id}>
      {label}
      <span className="flex min-w-0 items-center gap-1">
        <span className="shrink-0 text-fg-muted">{prefix}</span>
        <Input
          id={id}
          aria-label={label}
          readOnly={readOnly}
          value={fragment}
          onChange={(event) => {
            if (!readOnly) onChange?.(event.target.value);
          }}
          className="bg-raised"
        />
      </span>
    </label>
  );
}
