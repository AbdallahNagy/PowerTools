import { Search, X } from "lucide-react";
import { useFieldControl } from "./useFieldControl";
import { cn } from "./cn";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  "aria-label": ariaLabel,
}: SearchInputProps) {
  const field = useFieldControl();
  return (
    <div className={cn("relative flex items-center", className)}>
      <Search
        size={14}
        className="absolute left-2.5 text-fg-muted pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="text"
        {...field}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-8 py-1.5 bg-canvas border border-line text-fg text-sm rounded-sm placeholder:text-fg-muted focus:outline-none focus:border-focus"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 rounded-sm text-fg-muted hover:text-fg-strong"
          aria-label="Clear search"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
