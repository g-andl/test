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
import { deleteAccount, LOGIN_DOMAIN } from "@/lib/api";
import { humanError } from "@/lib/errors";

export default function AccountPage() {
  const { session, profile, signOut } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
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
    if (!session || confirm !== profile?.username) return;
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
          <p className="text-[13px] text-muted">Логин для входа</p>
          <p className="text-[15px] font-semibold">@{profile?.username}</p>
          {session?.user.email && !session.user.email.endsWith(`@${LOGIN_DOMAIN}`) && (
            <p className="mt-1 text-[13px] text-muted">или почта {session.user.email}</p>
          )}
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
          <Button variant="danger" block size="lg" loading={deleting} disabled={confirm !== profile?.username} onClick={onDelete}>
            Удалить навсегда
          </Button>
        }
      >
        <p className="mb-4 text-text-2">
          Это действие необратимо. Чтобы подтвердить, введи своё имя пользователя: <b className="text-text">{profile?.username}</b>
        </p>
        <Field label="Имя пользователя" value={confirm} autoCapitalize="none" onChange={(e) => setConfirm(e.target.value.trim().toLowerCase())} />
      </Sheet>
    </>
  );
}
