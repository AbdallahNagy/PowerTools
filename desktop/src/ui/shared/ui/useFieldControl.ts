import { createContext, useContext } from "react";

export interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Props a form control spreads onto its element so the surrounding <Field>
 * label, hint, and error are wired up. Returns an empty object outside a Field.
 */
export function useFieldControl(): {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
} {
  const field = useContext(FieldContext);
  if (!field) return {};
  return {
    id: field.id,
    "aria-describedby": field.describedBy,
    ...(field.invalid ? { "aria-invalid": true as const } : {}),
  };
}
