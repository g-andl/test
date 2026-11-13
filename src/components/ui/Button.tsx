"use client";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "outline";
type Size = "lg" | "md" | "sm";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-ink-fg hover:opacity-90",
  accent: "bg-accent text-white hover:bg-accent-strong",
  secondary: "bg-surface-2 text-text hover:bg-surface-3",
  ghost: "bg-transparent text-text hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:opacity-90",
  outline: "bg-surface text-text border border-line hover:bg-surface-2",
};
const sizes: Record<Size, string> = {
  lg: "h-14 px-6 text-base rounded-2xl",
  md: "h-12 px-5 text-[15px] rounded-2xl",
  sm: "h-10 px-4 text-sm rounded-xl",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, block, className = "", children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex select-none items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/** Круглая кнопка-иконка 44×44 */
export function IconButton({
  label,
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-text transition hover:bg-surface-2 active:scale-95 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
