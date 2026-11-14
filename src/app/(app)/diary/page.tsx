"use client";
import { useEffect, useMemo, useState } from "react";
import { SearchX, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Segmented, Chip } from "@/components/ui/Segmented";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { Timeline } from "@/components/diary/Timeline";
import { MonthCalendar } from "@/components/diary/MonthCalendar";
import { YearHeatmap } from "@/components/diary/YearHeatmap";
import { DaySheet } from "@/components/diary/DaySheet";
import { useMoodSheet } from "@/components/mood/MoodSheetProvider";
import { useMyEntries } from "@/hooks/data";
import { MOODS } from "@/lib/mood";
import { fromKey } from "@/lib/dates";
import { humanError } from "@/lib/errors";
import type { MoodValue } from "@/lib/types";
import { MoodEmoji } from "@/components/mood/MoodEmoji";

type Mode = "feed" | "calendar";
type CalMode = "month" | "year";

export default function DiaryPage() {
  const { entries, byDate, dayAgg, loading, error, refetch } = useMyEntries();
  const openMood = useMoodSheet();
  const now = new Date();
  const [mode, setMode] = useState<Mode>("feed");
  const [calMode, setCalMode] = useState<CalMode>("month");
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [filter, setFilter] = useState<MoodValue | null>(null);
  const [limit, setLimit] = useState(30);
  const [day, setDay] = useState<string | null>(null);

  const filtered = useMemo(() => (filter ? entries.filter((e) => e.mood_value === filter) : entries), [entries, filter]);
  // Лента показывается по дням: ограничиваем число дней, а не отметок
  const shownDays = useMemo(() => [...new Set(filtered.map((e) => e.entry_date))].slice(0, limit), [filtered, limit]);
  const shown = useMemo(() => {
    const set = new Set(shownDays);
    return filtered.filter((e) => set.has(e.entry_date));
  }, [filtered, shownDays]);
  const totalDays = useMemo(() => new Set(filtered.map((e) => e.entry_date)).size, [filtered]);
  const minYear = entries.length ? fromKey(entries[entries.length - 1].entry_date).getFullYear() : now.getFullYear();

  // Переход из полосы недели на главной: /diary/?day=YYYY-MM-DD
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("day");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- день берётся из адреса страницы
      setYm({ y: fromKey(d).getFullYear(), m: fromKey(d).getMonth() });
      setDay(d);
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const filters = (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 min-[380px]:-mx-5 min-[380px]:px-5 lg:mx-0 lg:px-0">
      <Chip active={!filter} onClick={() => setFilter(null)}>Все</Chip>
      {MOODS.map((m) => (
        <Chip key={m.value} active={filter === m.value} onClick={() => setFilter(filter === m.value ? null : m.value)}>
          <MoodEmoji value={m.value} size={20} decorative /> {m.label}
        </Chip>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader eyebrow="Личное" title="Мой дневник" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Режим дневника"
          className="flex-1 lg:max-w-xs"
          stretch
          value={mode}
          onChange={setMode}
          options={[
            { value: "feed", label: "Лента" },
            { value: "calendar", label: "Календарь" },
          ]}
        />
      </div>
      <div className="mb-5">{filters}</div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : error ? (
        <ErrorState text={humanError(error)} onRetry={refetch} />
      ) : mode === "feed" ? (
        filtered.length === 0 ? (
          <EmptyState
            icon={filter ? <SearchX /> : <BookOpen />}
            title={filter ? "Нет таких записей" : "Дневник пока пуст"}
            text={filter ? "Попробуй выбрать другое настроение" : "Отметь настроение — и здесь появится первая запись"}
            action={!filter && <Button onClick={() => openMood()}>Отметить настроение</Button>}
          />
        ) : (
          <div className="lg:max-w-2xl">
            <Timeline entries={shown} own />
            {totalDays > limit && (
              <Button variant="secondary" block className="mt-5" onClick={() => setLimit((l) => l + 30)}>
                Показать ещё
              </Button>
            )}
          </div>
        )
      ) : (
        <Card className="lg:max-w-3xl">
          <Segmented
            ariaLabel="Масштаб календаря"
            className="mb-4"
            stretch
            value={calMode}
            onChange={setCalMode}
            options={[
              { value: "month", label: "Месяц" },
              { value: "year", label: "Год" },
            ]}
          />
          {calMode === "month" ? (
            <MonthCalendar
              year={ym.y}
              month={ym.m}
              minYear={minYear}
              onChange={(y, m) => setYm({ y, m })}
              byDate={dayAgg}
              filter={filter}
              onDayClick={setDay}
            />
          ) : (
            <YearHeatmap
              year={ym.y}
              onYear={(y) => setYm((s) => ({ ...s, y }))}
              byDate={dayAgg}
              filter={filter}
              onDayClick={setDay}
              onMonthClick={(m) => {
                setYm((s) => ({ ...s, m }));
                setCalMode("month");
              }}
            />
          )}
        </Card>
      )}

      <DaySheet
        date={day}
        entries={day ? (byDate.get(day) ?? []) : []}
        own
        onClose={() => setDay(null)}
        onAdd={(d) => {
          setDay(null);
          openMood({ date: d });
        }}
      />
    </>
  );
}
