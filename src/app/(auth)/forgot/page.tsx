"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, TextArea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { humanError } from "@/lib/errors";
import { submitRecoveryRequest } from "@/lib/api";
import { OPERATOR } from "@/lib/legal";

/** Восстановление доступа: заявка администратору, он свяжется и поможет */
export default function ForgotPage() {
  const [username, setUsername] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const valid = username.trim().length > 0 && contact.trim().length >= 3 && message.trim().length >= 5;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await submitRecoveryRequest(username, contact, message);
      setSent(true);
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-[22px] bg-accent-soft text-accent">
          <CheckCircle2 className="size-8" />
        </span>
        <h1 className="text-[26px] font-extrabold tracking-tight">Заявка отправлена</h1>
        <p className="mt-2 text-text-2">
          Администратор свяжется с тобой по указанному контакту: <b className="text-text">{contact}</b>. Обычно это занимает до суток.
        </p>
        <Link href="/login/" className="mt-8 inline-flex h-12 items-center font-semibold text-accent">
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[28px] font-extrabold tracking-tight">Восстановление доступа</h1>
      <p className="mt-2 text-text-2">
        Оставь заявку — администратор свяжется с тобой в Telegram или VK, проверит, что аккаунт твой, и поможет задать новый пароль.
      </p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Field
          label="Имя пользователя или почта"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          maxLength={254}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="masha_k или you@example.com"
          hint={
            <>
              Не помнишь ни имени, ни почты? Напиши в поддержку:{" "}
              <a href={`mailto:${OPERATOR.email}`} className="font-semibold text-accent">{OPERATOR.email}</a>
            </>
          }
        />
        <Field
          label="Telegram или VK для связи"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={contact}
          maxLength={120}
          onChange={(e) => setContact(e.target.value)}
          placeholder="@masha_k или vk.com/masha"
        />
        <TextArea
          label="Что случилось"
          value={message}
          maxLength={2000}
          rows={4}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Например: забыла пароль, зарегистрировалась в начале ноября, имя в профиле — Маша"
        />
        {error && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" size="lg" block loading={loading} disabled={!valid}>
          Отправить заявку
        </Button>
        <p className="text-center text-xs text-muted">
          Контакт и описание видит только администратор и использует только для восстановления доступа.
        </p>
      </form>
      <Link href="/login/" className="mt-6 flex h-11 items-center justify-center font-semibold text-accent">
        Вернуться ко входу
      </Link>
    </>
  );
}
