"use client";
import { useState } from "react";
import { Lightbulb, ThumbsDown, ThumbsUp } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Stars, ratingLabel } from "./Stars";
import { useAuth } from "@/components/providers/AuthProvider";
import { useQuery } from "@/lib/query";
import { fetchReflections, keys, type DayReflection } from "@/lib/api";
import { VisibilityNote } from "./VisibilityNote";
import { plural, todayKey } from "@/lib/dates";

/** Мои итоги дней в статистике */
export function ReflectionStats() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const q = useQuery(uid ? keys.reflections(uid) : null, () => fetchReflections(uid!));
  const list = q.data ?? [];
  if (!uid || !list.length) return null;
  return <ReflectionSummary list={list} own />;
}

/** Средняя оценка за месяц и последние записи о том, что радовало, огорчало и чему научило. Для своих и чужих (открытых) итогов. */
export function ReflectionSummary({ list, own }: { list: DayReflection[]; own?: boolean }) {
  const [shown, setShown] = useState(5);

  // Месяц считаем в момент рендера списком: последние 30 дней по ключу даты
  const t = new Date();
  t.setDate(t.getDate() - 29);
  const from = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const rated = list.filter((r) => r.rating && r.day >= from && r.day <= todayKey());
  const avg = rated.length ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length : null;
  const withText = list.filter((r) => r.good || r.bad || r.insight);

  return (
    <Card className={own ? "mt-4" : ""}>
      <CardTitle>Итоги дней</CardTitle>
      {own && (
        <div className="-mt-3 mb-3">
          <VisibilityNote />
        </div>
      )}
      {avg !== null && (
        <div className="mb-4 rounded-2xl bg-surface-2 p-4">
          <p className="text-xs text-muted">Средняя оценка за 30 дней</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3">
            <span className="text-[28px] font-extrabold tracking-tight">{avg.toFixed(1).replace(".", ",")}</span>
            <Stars value={Math.round(avg)} size={22} />
          </div>
          <p className="mt-1 text-xs text-muted">{rated.length} {plural(rated.length, ["оценка", "оценки", "оценок"])}</p>
        </div>
      )}
      {withText.length > 0 && (
        <ul className="flex flex-col gap-3">
          {withText.slice(0, shown).map((r) => (
            <li key={r.day} className="rounded-2xl bg-surface-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold">
                  {new Date(`${r.day}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" })}
                </span>
                {r.rating && (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <Stars value={r.rating} size={14} /> {ratingLabel(r.rating)}
                  </span>
                )}
              </div>
              {r.good && (
                <p className="mt-2 flex gap-2 whitespace-pre-line break-words text-[15px] leading-snug">
                  <ThumbsUp className="mt-0.5 size-4 shrink-0 text-success" /> {r.good}
                </p>
              )}
              {r.bad && (
                <p className="mt-2 flex gap-2 whitespace-pre-line break-words text-[15px] leading-snug text-text-2">
                  <ThumbsDown className="mt-0.5 size-4 shrink-0 text-danger" /> {r.bad}
                </p>
              )}
              {r.insight && (
                <p className="mt-2 flex gap-2 whitespace-pre-line break-words text-[15px] leading-snug">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#f5b301]" /> {r.insight}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {withText.length > shown && (
        <Button variant="secondary" block className="mt-3" onClick={() => setShown((n) => n + 10)}>
          Показать ещё ({withText.length - shown})
        </Button>
      )}
    </Card>
  );
}
