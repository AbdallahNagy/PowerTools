import { CodeEditor, Input, Select } from "../../../shared/ui";
import { valueKind } from "../model/types";
import { SecretPathEditor } from "./SecretPathEditor";

interface ValueEditorProps {
  type: number;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  /** Shown when the value is empty, such as the default value. */
  placeholder?: string;
  "aria-label": string;
  /** Prefix for the secret builder's part labels. */
  labelPrefix?: string;
}

/**
 * The type-specific editor used in the details panel and the New Variable dialog.
 * Text, Number and Data Source use a text box, Boolean a yes/no list, JSON a code editor,
 * and Secret the Key Vault path builder.
 */
export function ValueEditor({
  type,
  value,
  onChange,
  invalid,
  disabled,
  placeholder,
  "aria-label": ariaLabel,
  labelPrefix,
}: ValueEditorProps) {
  switch (valueKind(type)) {
    case "boolean":
      return (
        <BooleanSelect
          value={value}
          onChange={onChange}
          invalid={invalid}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
        />
      );
    case "json":
      return (
        <CodeEditor
          value={value}
          onChange={disabled ? undefined : onChange}
          readOnly={disabled}
          folding
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={invalid ? "h-48 border-danger" : "h-48"}
        />
      );
    case "secret":
      return <SecretPathEditor value={value} onChange={onChange} disabled={disabled} labelPrefix={labelPrefix} />;
    default:
      return (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={invalid ? true : undefined}
        />
      );
  }
}

interface BooleanSelectProps {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  "aria-label": string;
  className?: string;
}

/** yes or no, the text Dataverse stores. Any other stored text is shown as it is. */
export function BooleanSelect({
  value,
  onChange,
  invalid,
  disabled,
  placeholder,
  "aria-label": ariaLabel,
  className,
}: BooleanSelectProps) {
  const other = value !== "" && value !== "yes" && value !== "no";
  return (
    <Select
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid ? true : undefined}
    >
      {value === "" ? <option value="">{placeholder ?? ""}</option> : null}
      {other ? <option value={value}>{value}</option> : null}
      <option value="yes">yes</option>
      <option value="no">no</option>
    </Select>
  );
}
