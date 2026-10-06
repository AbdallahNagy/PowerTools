import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent hover:bg-accent-hover text-accent-fg",
  secondary: "bg-raised hover:bg-hover text-fg border border-line-strong",
  ghost: "text-fg hover:text-fg-strong hover:bg-hover",
  danger: "bg-danger-soft hover:bg-danger/25 text-danger border border-danger/40",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-medium transition-colors",
        "focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
