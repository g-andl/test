"use client";
import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { updateProfile, uploadAvatar, usernameAvailable } from "@/lib/api";
import { humanError } from "@/lib/errors";

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export default function ProfileSettingsPage() {
  const { profile, setProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [uState, setUState] = useState<"ok" | "checking" | "taken" | "invalid">("ok");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- проверка имени при вводе */
    if (!profile || username === profile.username) return setUState("ok");
    if (!USERNAME_RE.test(username)) return setUState("invalid");
    setUState("checking");
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(async () => {
      try {
        setUState((await usernameAvailable(username)) ? "ok" : "taken");
      } catch {
        setUState("ok");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username, profile]);

  if (!profile) return null;
  const dirty = name.trim() !== profile.display_name || username !== profile.username;
  const valid = name.trim().length > 0 && uState === "ok";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || !valid || saving) return;
    setSaving(true);
    try {
      setProfile(await updateProfile(profile!.id, { display_name: name.trim(), username }));
      toast("Профиль сохранён");
    } catch (err) {
      toast(humanError(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(profile!.id, f);
      setProfile(await updateProfile(profile!.id, { avatar_url: url }));
      toast("Аватар обновлён");
    } catch (err) {
      toast(humanError(err), "error");
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      setProfile(await updateProfile(profile!.id, { avatar_url: null }));
    } catch (err) {
      toast(humanError(err), "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <PageHeader back title="Профиль" bell={false} />
      <div className="flex max-w-xl flex-col gap-4">
        <Card className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()} className="relative" aria-label="Сменить аватар" disabled={uploading}>
            <Avatar src={profile.avatar_url} name={profile.display_name} size={80} />
            <span className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-accent text-white">
              <Camera className="size-4" />
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatar} />
          <div className="flex flex-col items-start gap-1">
            <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
              Загрузить фото
            </Button>
            {profile.avatar_url && (
              <button onClick={removeAvatar} className="h-10 px-1 text-sm font-semibold text-danger" disabled={uploading}>
                Удалить аватар
              </button>
            )}
          </div>
        </Card>
        <Card>
          <form onSubmit={save} className="flex flex-col gap-4">
            <Field label="Имя" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
            <Field
              label="Имя пользователя"
              value={username}
              maxLength={24}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
              hint={uState === "checking" ? "Проверяем…" : "По нему тебя найдут друзья"}
              error={uState === "taken" ? "Это имя уже занято" : uState === "invalid" ? "Латиница, цифры и _, от 3 до 24 символов" : null}
            />
            <Button type="submit" size="lg" block loading={saving} disabled={!dirty || !valid}>
              Сохранить
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
