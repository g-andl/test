"use client";
import { useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BadgePill } from "./StatusBadge";

export const BADGE_COLORS = ["#2fb67c", "#d99a1e", "#4d8df7", "#e0568f", "#8b7cf6", "#e5605f", "#36b5c9", "#6b7383"];
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Выбор цвета: готовые цвета, свой цвет палитрой и ввод кода */
export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [hex, setHex] = useState(value);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- код цвета следует за выбором
    setHex(value);
  }, [value]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {BADGE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Цвет ${c}`}
          aria-pressed={value.toLowerCase() === c}
          className={`size-8 rounded-full border-2 transition active:scale-90 ${value.toLowerCase() === c ? "border-text" : "border-transparent"}`}
          style={{ background: c }}
        />
      ))}
      <label className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line text-xs text-muted" title="Свой цвет">
        +
        <input
          type="color"
          value={HEX_RE.test(value) ? value : "#4d8df7"}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Свой цвет"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <input
        value={hex}
        onChange={(e) => {
          const v = e.target.value.trim();
          setHex(v);
          if (HEX_RE.test(v)) onChange(v.toLowerCase());
        }}
        aria-label="Код цвета"
        maxLength={7}
        spellCheck={false}
        autoCapitalize="none"
        className={`h-9 w-24 rounded-lg bg-surface-2 px-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent ${HEX_RE.test(hex) ? "" : "ring-2 ring-danger"}`}
      />
    </div>
  );
}

/** Форма статуса: название + цвет + предпросмотр. Для создания и правки. */
export function BadgeForm({
  initialName = "",
  initialColor = "#4d8df7",
  submitLabel,
  busy,
  onSubmit,
  onDelete,
  holders,
  extra,
}: {
  initialName?: string;
  initialColor?: string;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (name: string, color: string) => void;
  onDelete?: () => void;
  holders?: number;
  extra?: React.ReactNode;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (!confirmDel) return;
    const t = setTimeout(() => setConfirmDel(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDel]);
  const valid = name.trim().length >= 1 && name.trim().length <= 24 && HEX_RE.test(color);
  const dirty = name.trim() !== initialName || color.toLowerCase() !== initialColor.toLowerCase();

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 24))}
          placeholder="Название статуса"
          aria-label="Название статуса"
          className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="w-28 shrink-0 text-center">
          {name.trim() ? <BadgePill name={name.trim()} color={HEX_RE.test(color) ? color : "#888888"} /> : <span className="text-xs text-muted">предпросмотр</span>}
        </div>
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!valid || !dirty} loading={busy} onClick={() => onSubmit(name.trim(), color.toLowerCase())}>
          <Save className="size-4" /> {submitLabel}
        </Button>
        {extra}
        {onDelete &&
          (confirmDel ? (
            <Button size="sm" variant="danger" className="ml-auto" loading={busy} onClick={onDelete}>
              Точно удалить?
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="ml-auto" aria-label="Удалить статус" onClick={() => setConfirmDel(true)}>
              <Trash2 className="size-4" /> Удалить{holders ? ` (у ${holders})` : ""}
            </Button>
          ))}
      </div>
    </div>
  );
}
