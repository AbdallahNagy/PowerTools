import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  const base = "px-4 py-2 rounded-sm text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none";
  const variants = {
    primary: "bg-[#007fd4] hover:bg-[#0069b4] text-white",
    secondary: "bg-[#3c3c3c] hover:bg-[#484848] text-[#cccccc] border border-[#555]",
    ghost: "text-[#cccccc] hover:text-white hover:bg-[#2a2d2e]",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
