"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/States";
import { useToast } from "@/components/providers/ToastProvider";
import { humanError } from "@/lib/errors";

export default function ResetPage() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);

  // Даём клиенту время обработать токен из ссылки
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8 || loading) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(humanError(error));
    toast("Пароль изменён");
    router.replace("/");
  }

  if (!ready || (!session && !waited)) return <div className="flex justify-center py-10"><Spinner /></div>;

  if (!session) {
    return (
      <>
        <h1 className="text-[26px] font-extrabold tracking-tight">Ссылка устарела</h1>
        <p className="mt-2 text-text-2">Запроси новую ссылку для смены пароля.</p>
        <Link href="/forgot/" className="mt-6 flex h-12 items-center justify-center rounded-2xl bg-ink font-semibold text-ink-fg">
          Запросить снова
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-tight">Новый пароль</h1>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Field label="Новый пароль" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Не короче 8 символов" />
        {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" size="lg" block loading={loading} disabled={password.length < 8}>
          Сохранить пароль
        </Button>
      </form>
    </>
  );
}
