"use client";
// Нижняя выдвижная панель (Bottom Sheet) на мобильном и диалог по центру на компьютере.
import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { X } from "lucide-react";

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  wide?: boolean;
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const drag = useDragControls();
  const panelRef = useRef<HTMLDivElement>(null);

  // Последний onClose храним в ref: эффект ниже не должен перезапускаться
  // при каждой перерисовке родителя (иначе фокус уходит из поля ввода после каждой буквы)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Блокируем прокрутку страницы, закрываем по Escape, фокус — один раз при открытии
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    }, 50);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-surface shadow-float outline-none lg:max-h-[88vh] lg:rounded-[28px] ${wide ? "lg:max-w-3xl" : "lg:max-w-lg"}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            {/* Ручка для смахивания вниз */}
            <div
              className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center lg:hidden"
              onPointerDown={(e) => drag.start(e)}
            >
              <span className="h-1.5 w-10 rounded-full bg-surface-3" />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 lg:pt-5" onPointerDown={(e) => drag.start(e)}>
              <h2 id={titleId} className="text-lg font-bold tracking-tight">
                {title}
              </h2>
              <button
                onClick={onClose}
                aria-label="Закрыть"
                className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer && <div className="shrink-0 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
            {!footer && <div className="pb-safe shrink-0" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
