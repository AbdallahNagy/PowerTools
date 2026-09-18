import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  problem?: string;
  children: ReactNode;
}

export function FormField({ label, htmlFor, problem, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs text-[var(--color-text-dark-gray)]">
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
  "bg-[var(--color-bg-light)] border border-[var(--color-border-dark)] text-[var(--color-text-gray)] text-sm px-2 py-1.5 rounded-sm focus:outline-none focus:border-[var(--color-primary)] w-full";
