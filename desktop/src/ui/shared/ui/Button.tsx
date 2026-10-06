import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  const base = "px-4 py-2 rounded-sm text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none";
  const variants = {
    primary: "bg-accent hover:bg-accent-hover text-accent-fg",
    secondary: "bg-raised hover:bg-hover text-fg border border-line-strong",
    ghost: "text-fg hover:text-fg-strong hover:bg-hover",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
