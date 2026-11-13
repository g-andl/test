"use client";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Bell } from "./Bell";

/** Заголовок экрана: маленькая надпись сверху, крупный заголовок, колокольчик справа */
export function PageHeader({
  eyebrow,
  title,
  back,
  actions,
  bell = true,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  back?: boolean;
  actions?: React.ReactNode;
  bell?: boolean;
}) {
  const router = useRouter();
  return (
    <header className="mb-5 flex items-end justify-between gap-3 pt-2 lg:pt-8">
      <div className="min-w-0">
        {back && (
          <button
            onClick={() => (history.length > 1 ? router.back() : router.push("/"))}
            className="-ml-2 mb-1 flex h-11 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] font-semibold text-accent"
          >
            <ChevronLeft className="size-5" /> Назад
          </button>
        )}
        {eyebrow && <p className="text-[15px] font-medium text-muted">{eyebrow}</p>}
        <h1 className="truncate text-[30px] font-extrabold leading-tight tracking-tight lg:text-[34px]">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2 pb-1">
        {actions}
        {bell && <Bell className="lg:hidden" />}
      </div>
    </header>
  );
}
