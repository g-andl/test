"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { StatsView } from "@/components/stats/StatsView";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMoodSheet } from "@/components/mood/MoodSheetProvider";
import { WeekStrip } from "@/components/home/WeekStrip";
import { TodayCard, TodayEntries } from "@/components/home/TodayCard";
import { FriendsMoods } from "@/components/home/FriendsMoods";
import { MonthSummary } from "@/components/home/MonthSummary";
import { FriendsActivity } from "@/components/home/FriendsActivity";
import { SupportPreview } from "@/components/support/SupportWall";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const { entries, byDate, dayAgg, loading, error, refetch } = useMyEntries();
  const [statsOpen, setStatsOpen] = useState(false);
  const today = byDate.get(todayKey()) ?? [];
  const firstName = profile?.display_name.split(" ")[0] ?? "";

  // Быстрое действие с иконки приложения: «Отметить настроение»
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mark") === "1") {
      openMood();
      history.replaceState(null, "", window.location.pathname);
    }
  }, [openMood]);

  const todayBlock = loading ? (
    <Skeleton className="h-56 rounded-[28px]" />
  ) : error ? (
    <ErrorState text={humanError(error)} onRetry={refetch} />
  ) : (
    <>
      <TodayCard entries={today} onOpen={(mood) => openMood({ mood })} />
      <SupportPreview />
      <TodayEntries entries={today} />
    </>
  );
  const monthBlock = loading ? <Skeleton className="h-40" /> : <MonthSummary entries={entries} />;
  // «Эта неделя» — в самом низу главной страницы
  const weekBlock = <WeekStrip byDate={dayAgg} onPick={(date) => router.push(`/diary/?day=${date}`)} />;

  return (
    <>
      <PageHeader eyebrow={capitalize(formatLong(new Date()))} title={`${greeting()}, ${firstName}!`} />
      {/* Телефон: одна колонка — отметка, сегодня, друзья, месяц, неделя */}
      <div className="flex flex-col gap-5 lg:hidden">
        {todayBlock}
        <FriendsMoods />
        {monthBlock}
        {weekBlock}
        <Button variant="outline" size="lg" onClick={() => setStatsOpen(true)}>
          <BarChart3 className="size-5" /> Статистика
        </Button>
      </div>
      <Sheet open={statsOpen} onClose={() => setStatsOpen(false)} title="Статистика" wide>
        <StatsView entries={entries} showInsights={false} />
      </Sheet>
      {/* Компьютер: слева отметка, сегодня и друзья, справа месяц и лента; неделя — внизу на всю ширину */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-12 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          {todayBlock}
          <FriendsMoods />
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
          {monthBlock}
          <FriendsActivity />
        </div>
        <div className="min-w-0 lg:col-span-12">{weekBlock}</div>
      </div>
    </>
  );
}
