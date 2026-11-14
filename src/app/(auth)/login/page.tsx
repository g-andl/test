"use client";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { humanError } from "@/lib/errors";
import { resolveLoginEmail } from "@/lib/api";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const email = await resolveLoginEmail(login);
      if (!email) {
        setError("Неверное имя пользователя или пароль");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(/Invalid login/i.test(error.message) ? "Неверное имя пользователя или пароль" : humanError(error));
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-tight">С возвращением</h1>
      <p className="mt-1 text-text-2">Войди, чтобы отметить настроение</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        <Field
          label="Имя пользователя"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="masha_k"
          hint="Если регистрировался по почте — можно ввести почту"
        />
        <Field label="Пароль" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={loading} disabled={!login.trim() || !password}>
          Войти
        </Button>
        <Link href="/forgot/" className="flex h-11 items-center justify-center text-sm font-semibold text-accent">
          Не получается войти?
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
