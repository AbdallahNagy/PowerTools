import { forwardRef } from "react";
import { Field } from "../../../shared/ui";
import { valueKind } from "../model/types";
import { ValueEditor } from "./ValueEditor";

interface ValueFieldProps {
  label: string;
  type: number;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * A labelled value editor. A Secret is built from several labelled parts, so it
 * gets a plain caption instead of a single `<label>`.
 */
export const ValueField = forwardRef<HTMLDivElement, ValueFieldProps>(function ValueField(
  { label, type, value, onChange, error = null, hint, disabled, placeholder },
  ref,
) {
  if (valueKind(type) === "secret") {
    return (
      <div ref={ref} className="flex flex-col gap-1">
        <span className="text-xs font-medium text-fg-muted">{label}</span>
        <ValueEditor
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-label={label}
          labelPrefix={label}
        />
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }
  return (
    <div ref={ref}>
      <Field label={label} error={error} hint={hint}>
        <ValueEditor
          type={type}
          value={value}
          onChange={onChange}
          invalid={error !== null}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={label}
        />
      </Field>
    </div>
  );
});
