import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Пункт списка настроек */
export function ListRow({
  href,
  icon,
  label,
  value,
  onClick,
  danger,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const inner = (
    <>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-danger-soft text-danger" : "bg-surface-2 text-text-2"}`}>
        {icon}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${danger ? "text-danger" : ""}`}>{label}</span>
      {value && <span className="truncate text-sm text-muted">{value}</span>}
      {href && <ChevronRight className="size-5 shrink-0 text-muted" />}
    </>
  );
  const cls = "flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2";
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}
