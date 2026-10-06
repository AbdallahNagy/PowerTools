import { useEffect, useRef } from "react";
import { cn } from "./cn";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  indeterminate?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  id,
  indeterminate = false,
  className,
  "aria-label": ariaLabel,
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      id={id}
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.checked)}
      className={cn("w-4 h-4 accent-accent cursor-pointer disabled:cursor-not-allowed", className)}
    />
  );
}
