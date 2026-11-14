"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { supabase } from "@/lib/supabase";
import { deleteAccount, fetchContactEmail, updateContactEmail, EMAIL_RE } from "@/lib/api";
import { useQuery, setQueryData } from "@/lib/query";
import { humanError } from "@/lib/errors";

export default function AccountPage() {
  const { session, profile, signOut } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const contact = useQuery(session ? "contact-email" : null, fetchContactEmail);
  const [mail, setMail] = useState<string | null>(null);
  const [mailBusy, setMailBusy] = useState(false);
  const mailValue = mail ?? contact.data ?? "";
  const mailValid = EMAIL_RE.test(mailValue.trim());
  async function saveMail() {
    if (!session || !mailValid) return;
    setMailBusy(true);
    try {
      await updateContactEmail(session.user.id, mailValue);
      setQueryData("contact-email", () => mailValue.trim().toLowerCase());
      setMail(null);
      toast("Почта сохранена");
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setMailBusy(false);
    }
  }
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (saving || next.length < 8) return;
    setSaving(true);
    setErr(null);
    // Проверяем текущий пароль повторным входом
    const check = await supabase.auth.signInWithPassword({ email: session!.user.email!, password: current });
    if (check.error) {
      setSaving(false);
      return setErr("Текущий пароль указан неверно");
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (error) return setErr(humanError(error));
    setCurrent("");
    setNext("");
    toast("Пароль изменён");
  }

  async function onDelete() {
    if (!session) return;
    setDeleting(true);
    try {
      await deleteAccount(session.user.id);
      await signOut();
      router.replace("/login/");
    } catch (e) {
      toast(humanError(e), "error");
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader back title="Аккаунт" bell={false} />
      <div className="flex max-w-xl flex-col gap-4">
        <Card>
          <p className="text-[13px] text-muted">Имя пользователя</p>
          <p className="text-[15px] font-semibold">@{profile?.username}</p>
          <p className="mt-3 text-[13px] text-muted">Почта для входа и восстановления</p>
          <div className="mt-1 flex gap-2">
            <input
              type="email"
              value={mailValue}
              onChange={(e) => setMail(e.target.value)}
              placeholder="не указана"
              aria-label="Почта"
              autoCapitalize="none"
              className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent"
            />
            <Button size="sm" disabled={!mailValid || mailValue.trim().toLowerCase() === (contact.data ?? "")} loading={mailBusy} onClick={saveMail}>
              Сохранить
            </Button>
          </div>
          <p className="mt-1.5 text-[12px] text-muted">Писем и кодов мы не отправляем: почта нужна, чтобы тебя можно было найти при восстановлении доступа.</p>
        </Card>
        <Card>
          <p className="mb-4 text-[15px] font-bold">Сменить пароль</p>
          <form onSubmit={changePassword} className="flex flex-col gap-4">
            <input type="text" autoComplete="username" value={profile?.username ?? ""} readOnly hidden />
            <Field label="Текущий пароль" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Field label="Новый пароль" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint="Не короче 8 символов" />
            {err && <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{err}</p>}
            <Button type="submit" block loading={saving} disabled={!current || next.length < 8}>
              Сменить пароль
            </Button>
          </form>
        </Card>
        <Card>
          <p className="text-[15px] font-bold">Удаление аккаунта</p>
          <p className="mt-1 text-[13px] text-muted">Все записи, фото, друзья и уведомления будут удалены без возможности восстановления.</p>
          <Button variant="danger" block className="mt-4" onClick={() => setDelOpen(true)}>
            Удалить аккаунт
          </Button>
        </Card>
      </div>

      <Sheet
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Удалить аккаунт?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" size="lg" onClick={() => setDelOpen(false)} disabled={deleting}>
              Отмена
            </Button>
            <Button variant="danger" className="flex-1" size="lg" loading={deleting} onClick={onDelete}>
              Точно удалить?
            </Button>
          </div>
        }
      >
        <p className="text-text-2">
          Удалятся все отметки, фото, друзья и уведомления аккаунта <b className="text-text">@{profile?.username}</b>. Восстановить их будет нельзя.
        </p>
      </Sheet>
    </>
  );
}
