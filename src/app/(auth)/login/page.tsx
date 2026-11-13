"use client";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { humanError } from "@/lib/errors";
import { appUrl } from "@/lib/paths";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setUnconfirmed(/not confirmed/i.test(error.message));
      setError(humanError(error));
    }
  }

  async function resend() {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: appUrl("/confirm/") },
    });
    if (error) setError(humanError(error));
    else setResent(true);
  }

  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-tight">С возвращением</h1>
      <p className="mt-1 text-text-2">Войди, чтобы отметить настроение</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        <Field label="Почта" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <Field label="Пароль" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && (
          <div role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {error}
            {unconfirmed && !resent && (
              <button type="button" onClick={resend} className="mt-1 block font-bold underline">
                Отправить письмо ещё раз
              </button>
            )}
            {resent && <span className="mt-1 block">Письмо отправлено.</span>}
          </div>
        )}
        <Button type="submit" size="lg" block loading={loading} disabled={!email || !password}>
          Войти
        </Button>
        <Link href="/forgot/" className="flex h-11 items-center justify-center text-sm font-semibold text-accent">
          Забыли пароль?
        </Link>
      </form>
      <p className="mt-6 text-center text-[15px] text-text-2">
        Нет аккаунта?{" "}
        <Link href="/register/" className="font-bold text-accent">
          Зарегистрироваться
        </Link>
      </p>
    </>
  );
}
