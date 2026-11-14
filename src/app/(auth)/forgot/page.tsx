"use client";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { humanError } from "@/lib/errors";
import { appUrl } from "@/lib/paths";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl("/reset/") });
    setLoading(false);
    if (error) setError(humanError(error));
    else setSent(true);
  }

  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-tight">Восстановление пароля</h1>
      {sent ? (
        <p className="mt-3 text-text-2">
          Если аккаунт с почтой <b className="text-text">{email}</b> существует, мы отправили на неё ссылку для смены пароля.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <p className="text-text-2">Укажи почту — пришлём ссылку для смены пароля.</p>
          <Field label="Почта" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" size="lg" block loading={loading} disabled={!email.includes("@")}>
            Отправить ссылку
          </Button>
        </form>
      )}
      <Link href="/login/" className="mt-6 flex h-11 items-center justify-center font-semibold text-accent">
        Вернуться ко входу
      </Link>
    </>
  );
}
