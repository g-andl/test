"use client";
import Link from "next/link";
import { ChevronRight, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/States";
import { useFriends } from "@/hooks/data";
import { moodOf } from "@/lib/mood";
import { formatRelativeDay, timeAgo } from "@/lib/dates";
import { MoodEmoji } from "@/components/mood/MoodEmoji";

/** «Как дела у друзей?» — горизонтальная лента карточек */
export function FriendsMoods() {
  const { data, loading } = useFriends();

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[19px] font-bold tracking-tight">Как дела у друзей?</h2>
        <Link href="/friends/" className="flex h-10 items-center gap-0.5 text-sm font-semibold text-accent">
          Все <ChevronRight className="size-4" />
        </Link>
      </div>
      {loading ? (
        <div className="flex gap-3">
          <Skeleton className="h-36 w-36" />
          <Skeleton className="h-36 w-36" />
        </div>
      ) : !data?.length ? (
        <Link href="/friends/" className="flex items-center gap-4 rounded-[24px] bg-surface p-4 shadow-card">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <UserPlus className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Добавь друзей</span>
            <span className="block text-sm text-muted">Найди их по имени пользователя</span>
          </span>
          <ChevronRight className="size-5 text-muted" />
        </Link>
      ) : (
        <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 min-[380px]:-mx-5 min-[380px]:px-5 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 xl:grid-cols-4">
          {data.map((f) => {
            const m = f.mood_value ? moodOf(f.mood_value) : null;
            return (
              <li key={f.id} className="w-[148px] shrink-0 snap-start lg:w-auto">
                <Link
                  href={`/user/?u=${f.username}`}
                  className="flex h-full flex-col rounded-[24px] bg-surface p-4 shadow-card transition active:scale-[0.98]"
                >
                  <div className="relative mb-3 w-fit">
                    <Avatar src={f.avatar_url} name={f.display_name} size={48} />
                    {m && (
                      <span
                        className="absolute -bottom-1 -right-2 flex size-7 items-center justify-center rounded-full border-2 border-surface text-[15px]"
                        style={{ background: m.soft }}
                      >
                        <MoodEmoji value={m.value} size={20} />
                      </span>
                    )}
                  </div>
                  <span className="truncate text-[15px] font-bold">{f.display_name}</span>
                  {m ? (
                    <>
                      <span className="text-sm font-semibold" style={{ color: m.color }}>{m.label}</span>
                      <span className="mt-auto pt-1 text-xs text-muted">
                        {f.entry_date && formatRelativeDay(f.entry_date) !== "Сегодня"
                          ? formatRelativeDay(f.entry_date)
                          : f.mood_updated_at ? timeAgo(f.mood_updated_at) : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-muted">Пока без отметок</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
