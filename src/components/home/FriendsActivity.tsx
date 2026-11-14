"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/States";
import { MoodEmoji } from "@/components/mood/MoodEmoji";
import { useQuery } from "@/lib/query";
import { fetchActivity, keys } from "@/lib/api";
import { moodOf } from "@/lib/mood";
import { timeAgo } from "@/lib/dates";

/** Последние отметки друзей — компактная лента */
export function FriendsActivity({ limit = 6 }: { limit?: number }) {
  const { data, loading } = useQuery(keys.activity, fetchActivity);
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-bold tracking-tight">Лента друзей</h2>
        <Link href="/friends/?tab=activity" className="-mr-1 flex h-10 items-center gap-0.5 text-sm font-semibold text-accent">
          Вся <ChevronRight className="size-4" />
        </Link>
      </div>
      {loading ? (
        <Skeleton className="h-32" />
      ) : !data?.length ? (
        <p className="py-3 text-sm text-muted">Здесь появятся отметки друзей за последние две недели.</p>
      ) : (
        <ul className="flex flex-col">
          {data.slice(0, limit).map((a) => {
            const m = moodOf(a.mood_value);
            return (
              <li key={a.entry_id + a.updated_at}>
                <Link href={`/user/?u=${a.username}`} className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2">
                  <Avatar src={a.avatar_url} name={a.display_name} size={36} />
                  <span className="min-w-0 flex-1 text-sm leading-snug">
                    <b>{a.display_name}</b> {a.is_update ? "обновил(а)" : "отметил(а)"}:{" "}
                    <span className="font-semibold" style={{ color: m.color }}>{m.label}</span>
                    <span className="block text-xs text-muted">{timeAgo(a.updated_at)}</span>
                  </span>
                  <MoodEmoji value={m.value} size={26} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
