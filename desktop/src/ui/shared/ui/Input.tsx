import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { useFieldControl } from "./useFieldControl";
import { cn } from "./cn";

const controlBase = cn(
  "w-full rounded-sm border border-line bg-canvas text-sm text-fg",
  "placeholder:text-fg-muted focus:outline-none focus:border-focus",
  "aria-[invalid=true]:border-danger",
  "disabled:opacity-50 disabled:cursor-not-allowed",
);

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const field = useFieldControl();
  return <input {...field} {...props} className={cn(controlBase, "px-2 py-1.5", className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useFieldControl();
  return (
    <textarea {...field} {...props} className={cn(controlBase, "px-2 py-1.5 resize-y", className)} />
  );
}

/** Native select, styled. Native keeps keyboard and screen reader behavior for free. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const field = useFieldControl();
  return (
    <div className={cn("relative", className)}>
      <select
        {...field}
        {...props}
        className={cn(controlBase, "appearance-none pl-2 pr-7 py-1.5 [&>option]:bg-surface")}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}
