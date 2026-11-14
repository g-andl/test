"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { Spinner } from "@/components/ui/States";

/** Сюда ведёт ссылка из письма подтверждения */
export default function ConfirmPage() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ошибка приходит в адресе ссылки
    if (/error/.test(hash)) setFailed(true);
  }, []);

  useEffect(() => {
    if (ready && session) {
      router.replace("/");
      return;
    }
    const t = setTimeout(() => setFailed(true), 4000);
    return () => clearTimeout(t);
  }, [ready, session, router]);

  if (failed && !session) {
    return (
      <>
        <h1 className="text-[26px] font-extrabold tracking-tight">Не получилось подтвердить</h1>
        <p className="mt-2 text-text-2">Возможно, ссылка устарела или уже использована. Попробуй войти — если почта не подтверждена, мы предложим отправить письмо снова.</p>
        <Link href="/login/" className="mt-6 flex h-12 items-center justify-center rounded-2xl bg-ink font-semibold text-ink-fg">
          Ко входу
        </Link>
      </>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-text-2">
      <Spinner />
      Подтверждаем почту…
    </div>
  );
}
