"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Ban, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { OPERATOR } from "@/lib/legal";
import type { BlockStatus } from "@/lib/types";

/** «21 ноября 2026, 18:34» — коротко, чтобы дата помещалась в одну строку */
const fmt = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
};

/** Экран для заблокированного аккаунта: срок, причина, как связаться с поддержкой */
export function BlockedScreen({ status, onRecheck }: { status: BlockStatus; onRecheck: () => void }) {
  const { signOut } = useAuth();
  const router = useRouter();

  // Срок блокировки может закончиться, пока экран открыт — проверяем раз в полминуты
  useEffect(() => {
    const t = setInterval(onRecheck, 30000);
    return () => clearInterval(t);
  }, [onRecheck]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center">
      <span className="mb-5 flex size-20 items-center justify-center rounded-[28px] bg-danger-soft text-danger">
        <Ban className="size-10" />
      </span>
      <h1 className="text-[28px] font-extrabold tracking-tight">Аккаунт заблокирован</h1>
      <p className="mt-3 text-[17px] text-text-2">
        {status.until ? (
          <>
            Доступ ограничен до
            {/* дата всегда на отдельной строке и не переносится */}
            <b className="mt-0.5 block whitespace-nowrap text-[19px] text-text">{fmt(status.until)}</b>
          </>
        ) : (
          <>Доступ ограничен <b className="text-text">бессрочно</b></>
        )}
      </p>
      {status.reason && (
        <p className="mt-4 w-full rounded-2xl bg-surface-2 px-4 py-3 text-left text-[15px] text-text-2">
          <span className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-muted">Причина</span>
          {status.reason}
        </p>
      )}
      <p className="mt-5 text-[15px] leading-relaxed text-muted">
        Пока аккаунт заблокирован, нельзя ставить отметки и пользоваться друзьями. Если считаешь, что это ошибка, напиши
        в поддержку: <a href={`mailto:${OPERATOR.email}`} className="font-semibold text-text underline underline-offset-2">{OPERATOR.email}</a>
      </p>
      <Button variant="ghost" className="mt-3" onClick={async () => { await signOut(); router.replace("/login/"); }}>
        <LogOut className="size-5" /> Выйти
      </Button>
    </main>
  );
}
