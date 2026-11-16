"use client";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { readReturn, returnToAdmin } from "@/lib/impersonate";

/** Боковая вкладка у правого края: видна, пока админ находится в чужом аккаунте */
export function ImpersonationTab() {
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- читаем localStorage только в браузере
    setName(readReturn()?.asName ?? null);
  }, []);
  if (!name) return null;
  return (
    <button
      onClick={async () => {
        setBusy(true);
        await returnToAdmin();
      }}
      disabled={busy}
      title={`Вы вошли как ${name}`}
      aria-label={`Вы вошли как ${name}. Вернуться в админ-панель`}
      className="fixed right-0 top-1/2 z-[60] flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-xl bg-danger px-2 py-3 text-xs font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-60"
    >
      <ShieldCheck className="size-4" />
      <span className="[writing-mode:vertical-rl]">В админ-панель</span>
    </button>
  );
}
