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
            ? "text-[var(--color-text-dark-gray)] cursor-not-allowed"
            : "text-[var(--color-text-dark-gray)]"
        }`}
      >
        {label}
      </label>
      {children}
      {problem ? (
        <p role="alert" className="text-xs text-[var(--color-text-white)]">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

export const fieldControlClass =
  "bg-[var(--color-bg-light)] border border-[var(--color-border-dark)] text-[var(--color-text-gray)] text-sm px-2 py-1.5 rounded-sm focus:outline-none focus:border-[var(--color-primary)] w-full disabled:text-[var(--color-text-dark-gray)] disabled:cursor-not-allowed disabled:opacity-60";
