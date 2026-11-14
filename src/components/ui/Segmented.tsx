"use client";

/** Горизонтальный переключатель (периоды, режимы). Прокручивается внутри себя. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
  stretch,
  ariaLabel,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  stretch?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-surface-3/70 p-1 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`h-10 shrink-0 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition ${stretch ? "flex-1" : ""} ${active ? "bg-surface text-text shadow-card" : "text-muted hover:text-text"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Фильтр-чипсы */
export function Chip({
  active,
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition active:scale-95 ${active ? "bg-ink text-ink-fg" : "bg-surface text-text-2 hover:bg-surface-2"} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
