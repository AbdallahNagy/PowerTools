const fieldClass =
  "w-full rounded-sm border border-[var(--color-border-dark)] bg-[var(--color-bg-light)] px-2 py-1.5 text-sm text-[var(--color-text-gray)] focus:border-[var(--color-primary)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";

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
    <label className="flex flex-col gap-1 text-xs text-[var(--color-text-dark-gray)]" htmlFor={id}>
      {label}
      <input
        id={id}
        aria-label={label}
        readOnly={readOnly}
        value={value}
        onChange={(event) => {
          if (!readOnly) onChange?.(event.target.value);
        }}
        className={fieldClass}
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
    <label className="flex flex-col gap-1 text-xs text-[var(--color-text-dark-gray)]" htmlFor={id}>
      {label}
      <select
        id={id}
        aria-label={label}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          if (!disabled) onChange?.(event.target.value);
        }}
        className={fieldClass}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
    <label className="flex flex-col gap-1 text-xs text-[var(--color-text-dark-gray)]" htmlFor={id}>
      {label}
      <span className="flex min-w-0 items-center gap-1">
        <span className="shrink-0 text-[var(--color-text-dark-gray)]">{prefix}</span>
        <input
          id={id}
          aria-label={label}
          readOnly={readOnly}
          value={fragment}
          onChange={(event) => {
            if (!readOnly) onChange?.(event.target.value);
          }}
          className={fieldClass}
        />
      </span>
    </label>
  );
}
