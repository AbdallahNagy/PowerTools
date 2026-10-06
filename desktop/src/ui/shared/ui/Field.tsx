import { useId, type ReactNode } from "react";
import { FieldContext } from "./useFieldControl";
import { cn } from "./cn";

interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Use when the control needs a specific id, for example for tests. */
  id?: string;
  className?: string;
}

/** Labels one form control and shows its hint or error. */
export function Field({ label, children, hint, error, id, className }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hint && !error ? hintId : undefined, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id: controlId, describedBy, invalid: Boolean(error) }}>
      <div className={cn("flex flex-col gap-1", className)}>
        <label htmlFor={controlId} className="text-xs font-medium text-fg-muted">
          {label}
        </label>
        {children}
        {hint && !error ? (
          <p id={hintId} className="text-xs text-fg-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
