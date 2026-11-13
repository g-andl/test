"use client";
import { useEffect } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMoodSheet } from "@/components/mood/MoodSheetProvider";
import { WeekStrip } from "@/components/home/WeekStrip";
import { TodayCard } from "@/components/home/TodayCard";
import { FriendsMoods } from "@/components/home/FriendsMoods";
import { MonthSummary } from "@/components/home/MonthSummary";
import { Skeleton, ErrorState } from "@/components/ui/States";
import { useMyEntries } from "@/hooks/data";
import { capitalize, formatLong, todayKey } from "@/lib/dates";
import { humanError } from "@/lib/errors";

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export default function HomePage() {
  const { profile } = useAuth();
  const openMood = useMoodSheet();
  const { entries, byDate, loading, error, refetch } = useMyEntries();
  const today = byDate.get(todayKey());
  const firstName = profile?.display_name.split(" ")[0] ?? "";

  // Быстрое действие с иконки приложения: «Отметить настроение»
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mark") === "1") {
      openMood();
      history.replaceState(null, "", window.location.pathname);
    }
  }, [openMood]);

  return (
    <>
      <PageHeader eyebrow={capitalize(formatLong(new Date()))} title={`${greeting()}, ${firstName}!`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {loading ? (
            <Skeleton className="h-56 rounded-[28px]" />
          ) : error ? (
            <ErrorState text={humanError(error)} onRetry={refetch} />
          ) : (
            <TodayCard entry={today} onOpen={(mood) => openMood({ mood })} />
          )}
          <WeekStrip byDate={byDate} onPick={(date) => openMood({ date })} />
          <FriendsMoods />
        </div>
        <div className="flex flex-col gap-5">
          {loading ? <Skeleton className="h-40" /> : <MonthSummary entries={entries} />}
        </div>
      </div>
    </>
  );
}
