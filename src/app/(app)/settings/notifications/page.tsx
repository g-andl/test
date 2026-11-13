"use client";
import { BellOff } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { Skeleton, ErrorState } from "@/components/ui/States";
import { PushToggle } from "@/components/notifications/PushControl";
import { UserRow } from "@/components/friends/UserRow";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useFriends } from "@/hooks/data";
import { useQuery, setQueryData, invalidate } from "@/lib/query";
import { fetchNotifSettings, updateNotifSettings, setMuted, keys } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { humanError } from "@/lib/errors";
import type { NotificationSettings } from "@/lib/types";

export default function NotificationSettingsPage() {
  const { session } = useAuth();
  const toast = useToast();
  const q = useQuery(keys.notifSettings, fetchNotifSettings);
  const friends = useFriends();
  const muted = useQuery("muted", async () => {
    const { data, error } = await supabase.from("muted_friends").select("muted_id");
    if (error) throw error;
    return new Set((data ?? []).map((r) => r.muted_id as string));
  });
  const s = q.data;

  async function set(patch: Partial<NotificationSettings>) {
    if (!s) return;
    const prev = s;
    setQueryData<NotificationSettings>(keys.notifSettings, (p) => ({ ...p!, ...patch }));
    try {
      const saved = await updateNotifSettings(session!.user.id, patch);
      setQueryData(keys.notifSettings, () => saved);
    } catch (e) {
      setQueryData(keys.notifSettings, () => prev);
      toast(humanError(e), "error");
    }
  }

  async function toggleMute(id: string, value: boolean) {
    try {
      await setMuted(session!.user.id, id, value);
      invalidate("muted", "user");
    } catch (e) {
      toast(humanError(e), "error");
    }
  }

  return (
    <>
      <PageHeader back title="Уведомления" bell={false} />
      <div className="flex max-w-xl flex-col gap-4">
        {q.loading ? (
          <Skeleton className="h-80" />
        ) : q.error || !s ? (
          <ErrorState text={humanError(q.error)} onRetry={q.refetch} />
        ) : (
          <>
            <Card className="divide-y divide-line">
              <PushToggle />
              <Toggle
                label="Уведомления в приложении"
                description="Список под колокольчиком"
                checked={s.inapp_enabled}
                onChange={(v) => set({ inapp_enabled: v })}
              />
            </Card>
            <Card className="divide-y divide-line">
              <p className="pb-2 text-[15px] font-bold">О чём сообщать</p>
              <Toggle label="Заявки в друзья" description="Новые заявки, принятые заявки и новые друзья" checked={s.friend_request_enabled} onChange={(v) => set({ friend_request_enabled: v })} />
              <Toggle label="Друг отметил настроение" checked={s.friend_mood_enabled} onChange={(v) => set({ friend_mood_enabled: v })} />
              <Toggle label="Друг изменил настроение" checked={s.friend_update_enabled} onChange={(v) => set({ friend_update_enabled: v })} />
            </Card>
            <Card>
              <p className="mb-1 text-[15px] font-bold">Уведомления от друзей</p>
              <p className="mb-3 text-[13px] text-muted">Можно отключить уведомления о настроении конкретных людей.</p>
              {!friends.data?.length ? (
                <p className="text-sm text-muted">Пока нет друзей</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {friends.data.map((f) => {
                    const isMuted = muted.data?.has(f.id) ?? false;
                    return (
                      <li key={f.id}>
                        <UserRow
                          user={f}
                          sub={isMuted ? <span className="flex items-center gap-1"><BellOff className="size-3.5" /> Отключены</span> : `@${f.username}`}
                          right={
                            <Button size="sm" variant={isMuted ? "accent" : "secondary"} onClick={() => toggleMute(f.id, !isMuted)}>
                              {isMuted ? "Включить" : "Отключить"}
                            </Button>
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
