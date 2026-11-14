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
import { makeLoginEmail, EMAIL_RE } from "@/lib/api";
import { LEGAL_VERSION } from "@/lib/legal";

/** Флажок согласия: большая зона нажатия, ссылки внутри текста открываются отдельно */
function ConsentBox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-xl py-2 text-[13px] leading-snug text-text-2 [&_a]:font-semibold [&_a]:text-accent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[var(--accent)]"
      />
      <span>{children}</span>
    </label>
  );
}

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [usernameState, setUsernameState] = useState<"idle" | "checking" | "free" | "taken" | "invalid">("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Три отдельных согласия — по требованиям 152-ФЗ; изначально не отмечены
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePd, setAgreePd] = useState(false);
  const [agreeDist, setAgreeDist] = useState(false);

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

  const valid =
    name.trim() && usernameState === "free" && EMAIL_RE.test(email.trim()) && password.length >= 8 && agreeTerms && agreePd && agreeDist;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    // Почта не нужна: аккаунту выдаётся служебный адрес, вход — по имени пользователя
    const { data, error } = await supabase.auth.signUp({
      email: makeLoginEmail(),
      password,
      options: {
        data: {
          username: username.trim(),
          display_name: name.trim(),
          timezone: browserTimezone(),
          contact_email: email.trim().toLowerCase(),
          // Факт и время согласий хранятся в аккаунте
          consents: { version: LEGAL_VERSION, at: new Date().toISOString(), terms: true, personal_data: true, distribution: true },
        },
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
        <h1 className="text-[26px] font-extrabold tracking-tight">Готово</h1>
        <p className="mt-2 text-text-2">
          Аккаунт создан. Войди, используя имя пользователя и пароль.
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
        <Field
          label="Почта"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          hint="Для входа и восстановления доступа. Писем и кодов не отправляем"
          error={email && !EMAIL_RE.test(email.trim()) ? "Проверь адрес почты" : null}
        />
        <Field
          label="Пароль"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Не короче 8 символов"
          error={password && password.length < 8 ? "Не короче 8 символов" : null}
        />
        <div className="flex flex-col gap-1 rounded-2xl bg-surface-2 px-3 py-2">
          {/* Одно касание отмечает все три согласия, но каждое остаётся отдельным — как требует закон */}
          <label className="flex cursor-pointer items-center gap-3 border-b border-line py-2.5 text-[15px] font-semibold">
            <input
              type="checkbox"
              checked={agreeTerms && agreePd && agreeDist}
              onChange={(e) => {
                setAgreeTerms(e.target.checked);
                setAgreePd(e.target.checked);
                setAgreeDist(e.target.checked);
              }}
              className="size-5 shrink-0 cursor-pointer accent-[var(--accent)]"
            />
            Принимаю все условия
          </label>
          <ConsentBox checked={agreeTerms} onChange={setAgreeTerms}>
            Принимаю <Link href="/legal/terms/" target="_blank">Пользовательское соглашение</Link> и ознакомлен(а) с{" "}
            <Link href="/legal/privacy/" target="_blank">Политикой обработки персональных данных</Link>
          </ConsentBox>
          <ConsentBox checked={agreePd} onChange={setAgreePd}>
            Даю <Link href="/legal/consent/" target="_blank">согласие на обработку персональных данных</Link>
          </ConsentBox>
          <ConsentBox checked={agreeDist} onChange={setAgreeDist}>
            Даю <Link href="/legal/distribution/" target="_blank">согласие на распространение</Link> имени, имени пользователя и
            аватара среди пользователей; остальное — по моим настройкам приватности
          </ConsentBox>
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={loading} disabled={!valid}>
          Зарегистрироваться
        </Button>
        <p className="text-center text-xs text-muted">Сервис бесплатный. Настрой не является медицинским приложением и не ставит диагнозов.</p>
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
