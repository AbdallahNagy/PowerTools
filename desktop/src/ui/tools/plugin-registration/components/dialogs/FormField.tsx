import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  problem?: string;
  disabled?: boolean;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  problem,
  disabled,
  children,
}: FormFieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-60" : ""}`}>
      <label
        htmlFor={htmlFor}
        className={`text-xs ${
          disabled
            ? "text-fg-muted cursor-not-allowed"
            : "text-fg-muted"
        }`}
      >
        {label}
      </label>
      {children}
      {problem ? (
        <p role="alert" className="text-xs text-fg-strong">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

export const fieldControlClass =
  "bg-raised border border-line text-fg text-sm px-2 py-1.5 rounded-sm focus:outline-none focus:border-focus w-full disabled:text-fg-muted disabled:cursor-not-allowed disabled:opacity-60";
