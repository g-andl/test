"use client";
// Графики на Recharts. Файл подгружается лениво — не утяжеляет первую загрузку.
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell, ReferenceLine,
} from "recharts";
import { moodOf } from "@/lib/mood";
import { fmtAvg, type SeriesPoint, type WeekdayStat } from "@/lib/stats";
import { WEEKDAYS_SHORT, WEEKDAYS, plural } from "@/lib/dates";
import { useCssVars } from "./useCssVars";
import { MoodEmoji, moodEmojiSrc } from "@/components/mood/MoodEmoji";

const VARS = ["accent", "muted", "line", "surface", "text", "mood-1", "mood-2", "mood-3", "mood-4", "mood-5"] as const;

const colorFor = (v: Record<(typeof VARS)[number], string>, value: number) =>
  v[`mood-${Math.round(Math.min(5, Math.max(1, value)))}` as "mood-1"];

function TipBox({ title, value, sub }: { title: string; value: number | null; sub?: string }) {
  const m = value ? moodOf(value) : null;
  return (
    <div className="rounded-2xl bg-ink px-3.5 py-2.5 text-ink-fg shadow-float">
      <p className="text-xs opacity-70">{title}</p>
      {m ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold">
          <MoodEmoji value={m.value} size={18} /> {value! % 1 === 0 ? m.label : fmtAvg(value)}
        </p>
      ) : (
        <p className="mt-0.5 text-sm font-semibold">Нет отметок</p>
      )}
      {sub && <p className="text-xs opacity-70">{sub}</p>}
    </div>
  );
}

const EmojiTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) => (
  payload ? <image href={moodEmojiSrc(payload.value)} x={(x ?? 0) - 20} y={(y ?? 0) - 9} width={18} height={18} /> : <g />
);

/** Динамика настроения по шкале 1–5 */
export function DynamicsChart({ data, aggregated }: { data: SeriesPoint[]; aggregated: boolean }) {
  const v = useCssVars(VARS);
  const interval = data.length > 14 ? Math.ceil(data.length / 6) - 1 : 0;
  return (
    <div className="h-[220px] w-full" role="img" aria-label="График динамики настроения">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={v.line} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={interval} tick={{ fill: v.muted, fontSize: 12 }} dy={6} />
          <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} width={30} tickLine={false} axisLine={false} tick={<EmojiTick />} />
          <Tooltip
            cursor={{ stroke: v.muted, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as SeriesPoint;
              return (
                <TipBox
                  title={aggregated ? `Неделя/месяц с ${p.label}` : p.label}
                  value={p.value}
                  sub={aggregated && p.count ? `${p.count} ${plural(p.count, ["отметка", "отметки", "отметок"])}` : undefined}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={v.accent}
            strokeWidth={2}
            connectNulls
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; payload?: SeriesPoint; index?: number }) => {
              const { cx, cy, payload, index } = props;
              if (cx == null || cy == null || payload?.value == null) return <g key={index} />;
              return <circle key={index} cx={cx} cy={cy} r={4.5} fill={colorFor(v, payload.value)} stroke={v.surface} strokeWidth={2} />;
            }}
            activeDot={{ r: 7, stroke: v.surface, strokeWidth: 2, fill: v.accent }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Среднее настроение по дням недели */
export function WeekdayChart({ data, overall }: { data: WeekdayStat[]; overall: number | null }) {
  const v = useCssVars(VARS);
  const rows = data.map((d) => ({ ...d, label: WEEKDAYS_SHORT[d.index], h: d.avg ?? 0 }));
  return (
    <div className="h-[200px] w-full" role="img" aria-label="Среднее настроение по дням недели">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 10, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={v.line} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: v.muted, fontSize: 12 }} dy={4} />
          <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} width={30} tickLine={false} axisLine={false} tick={<EmojiTick />} />
          {overall !== null && <ReferenceLine y={overall} stroke={v.muted} strokeDasharray="4 4" />}
          <Tooltip
            cursor={{ fill: v.line, opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as WeekdayStat;
              return (
                <TipBox
                  title={WEEKDAYS[p.index]}
                  value={p.avg}
                  sub={`${p.count} ${plural(p.count, ["отметка", "отметки", "отметок"])}`}
                />
              );
            }}
          />
          <Bar dataKey="h" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.index} fill={r.avg ? colorFor(v, r.avg) : v.line} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
