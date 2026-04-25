"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed";

const variantClasses: Record<Variant, string> = {
  primary: "bg-amber-400 text-zinc-950 hover:bg-amber-300 font-semibold",
  secondary:
    "border border-zinc-700 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-900",
  ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900",
  danger:
    "border border-red-900/60 text-red-300 hover:border-red-700 hover:bg-red-950/40",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className = "",
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
