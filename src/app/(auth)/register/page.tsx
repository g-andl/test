"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { humanError } from "@/lib/errors";
import { usernameAvailable } from "@/lib/api";
import { browserTimezone } from "@/lib/dates";
import { appUrl } from "@/lib/paths";

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usernameState, setUsernameState] = useState<"idle" | "checking" | "free" | "taken" | "invalid">("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Проверка имени пользователя «на лету»
  useEffect(() => {
    const u = username.trim();
    /* eslint-disable react-hooks/set-state-in-effect -- статус проверки зависит от ввода */
    if (!u) return setUsernameState("idle");
    if (!USERNAME_RE.test(u)) return setUsernameState("invalid");
    setUsernameState("checking");
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(async () => {
      try {
        setUsernameState((await usernameAvailable(u)) ? "free" : "taken");
      } catch {
        setUsernameState("idle");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  const usernameHint = {
    idle: "Латиница, цифры и _, от 3 до 24 символов",
    checking: "Проверяем…",
    free: "✓ Имя свободно",
    taken: null,
    invalid: null,
  }[usernameState];
  const usernameError =
    usernameState === "taken" ? "Это имя уже занято" : usernameState === "invalid" ? "Только латиница, цифры и _, от 3 до 24 символов" : null;

  const valid = name.trim() && usernameState === "free" && email.includes("@") && password.length >= 8;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: appUrl("/confirm/"),
        data: { username: username.trim(), display_name: name.trim(), timezone: browserTimezone() },
      },
    });
    setLoading(false);
    if (error) return setError(humanError(error));
    // Если подтверждение почты выключено — сессия появится сразу
    if (!data.session) setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-[22px] bg-accent-soft text-accent">
          <MailCheck className="size-8" />
        </span>
        <h1 className="text-[26px] font-extrabold tracking-tight">Проверь почту</h1>
        <p className="mt-2 text-text-2">
          Мы отправили письмо на <b className="text-text">{email}</b>. Нажми на ссылку в нём, чтобы подтвердить аккаунт.
        </p>
        <Link href="/login/" className="mt-8 inline-flex h-12 items-center font-semibold text-accent">
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-tight">Создать аккаунт</h1>
      <p className="mt-1 text-text-2">Начни вести дневник настроения</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        <Field label="Имя" autoComplete="given-name" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="Как к тебе обращаться" />
        <Field
          label="Имя пользователя"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          maxLength={24}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
          placeholder="masha_k"
          hint={usernameHint}
          error={usernameError}
        />
        <Field label="Почта" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <Field
          label="Пароль"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Не короче 8 символов"
          error={password && password.length < 8 ? "Не короче 8 символов" : null}
        />
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={loading} disabled={!valid}>
          Зарегистрироваться
        </Button>
        <p className="text-center text-xs text-muted">Настрой не является медицинским приложением и не ставит диагнозов.</p>
      </form>
      <p className="mt-6 text-center text-[15px] text-text-2">
        Уже есть аккаунт?{" "}
        <Link href="/login/" className="font-bold text-accent">
          Войти
        </Link>
      </p>
    </>
  );
}
