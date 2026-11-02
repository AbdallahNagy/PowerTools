import { Field, Input } from "../../../shared/ui";
import {
  buildSecretPath,
  EMPTY_SECRET_PATH,
  parseSecretPath,
  SECRET_PATH_FIELDS,
  type SecretPathParts,
} from "../model/secretPath";

interface SecretPathEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Prefix for each part's label, such as "Default Value". */
  labelPrefix?: string;
}

/** Builds an Azure Key Vault secret reference path from its parts. Secret contents are never read. */
export function SecretPathEditor({ value, onChange, disabled, labelPrefix }: SecretPathEditorProps) {
  const parts = parseSecretPath(value) ?? EMPTY_SECRET_PATH;

  const change = (key: keyof SecretPathParts, part: string) => {
    const next = { ...parts, [key]: part };
    const empty = Object.values(next).every((item) => item.trim() === "");
    onChange(empty ? "" : buildSecretPath(next));
  };

  return (
    <div className="flex flex-col gap-2">
      {SECRET_PATH_FIELDS.map((field) => (
        <Field key={field.key} label={labelPrefix ? `${labelPrefix}: ${field.label}` : field.label}>
          <Input
            className="font-mono"
            value={parts[field.key]}
            disabled={disabled}
            aria-invalid={value !== "" && parts[field.key].trim() === "" ? true : undefined}
            onChange={(event) => change(field.key, event.target.value)}
          />
        </Field>
      ))}
      <p className="break-all font-mono text-xs text-fg-muted" aria-label="Secret path">
        {value || buildSecretPath(EMPTY_SECRET_PATH)}
      </p>
    </div>
  );
}
