"use client";
import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
import { useUnread } from "@/hooks/data";

export function Bell({ className = "" }: { className?: string }) {
  const { data: unread = 0 } = useUnread();
  return (
    <Link
      href="/notifications/"
      aria-label={unread ? `Уведомления: ${unread} непрочитанных` : "Уведомления"}
      className={`relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-text shadow-card transition active:scale-95 ${className}`}
    >
      <BellIcon className="size-[22px]" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-danger px-1 text-[11px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
