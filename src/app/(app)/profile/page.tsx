"use client";
import { User, Shield, Bell, KeyRound, LogOut, Sun, Moon, Monitor, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ListRow } from "@/components/ui/ListRow";
import { Segmented } from "@/components/ui/Segmented";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme, type ThemePref } from "@/components/providers/ThemeProvider";
import { useMyEntries, useFriends } from "@/hooks/data";
import { currentStreak } from "@/lib/stats";
import { plural } from "@/lib/dates";

export default function ProfilePage() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const { entries } = useMyEntries();
  const friends = useFriends();
  if (!profile) return null;
  const streak = currentStreak(entries);

  const stats = [
    { label: plural(entries.length, ["запись", "записи", "записей"]), value: entries.length },
    { label: plural(streak, ["день подряд", "дня подряд", "дней подряд"]), value: streak },
    { label: plural(friends.data?.length ?? 0, ["друг", "друга", "друзей"]), value: friends.data?.length ?? 0 },
  ];

  return (
    <>
      <PageHeader eyebrow="Аккаунт" title="Профиль" />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <Card className="flex flex-col items-center text-center">
          <Avatar src={profile.avatar_url} name={profile.display_name} size={96} />
          <h2 className="mt-3 text-[22px] font-extrabold tracking-tight">{profile.display_name}</h2>
          <p className="text-muted">@{profile.username}</p>
          <StatusBadge userId={profile.id} className="mt-2 !text-xs" />
          <div className="mt-5 grid w-full grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl bg-surface-2 px-2 py-3">
                <p className="text-[20px] font-extrabold">{s.value}</p>
                <p className="text-xs text-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="!p-3">
            <ListRow href="/settings/profile/" icon={<User className="size-5" />} label="Профиль" value="Имя, аватар" />
            <ListRow href="/settings/privacy/" icon={<Shield className="size-5" />} label="Приватность" />
            <ListRow href="/settings/notifications/" icon={<Bell className="size-5" />} label="Уведомления" />
            <ListRow href="/settings/account/" icon={<KeyRound className="size-5" />} label="Аккаунт" value="Пароль, удаление" />
            <ListRow href="/legal/" icon={<FileText className="size-5" />} label="Документы" value="Правила, политика" />
          </Card>

          <Card>
            <p className="mb-3 text-[15px] font-semibold">Тема оформления</p>
            <Segmented<ThemePref>
              ariaLabel="Тема оформления"
              stretch
              value={theme}
              onChange={setTheme}
              options={[
                { value: "system", label: <span className="flex items-center gap-1.5"><Monitor className="size-4" /> Авто</span> },
                { value: "light", label: <span className="flex items-center gap-1.5"><Sun className="size-4" /> Светлая</span> },
                { value: "dark", label: <span className="flex items-center gap-1.5"><Moon className="size-4" /> Тёмная</span> },
              ]}
            />
          </Card>

          <Card className="!p-3">
            <ListRow
              icon={<LogOut className="size-5" />}
              label="Выйти"
              danger
              onClick={async () => {
                await signOut();
                router.replace("/login/");
              }}
            />
          </Card>
          <p className="px-2 text-center text-xs text-muted">Настрой — дневник настроения, а не медицинское приложение.</p>
        </div>
      </div>
    </>
  );
}
