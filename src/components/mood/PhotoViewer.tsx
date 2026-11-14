"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Фото на весь экран: закрывается касанием, крестиком или Esc */
export function PhotoViewer({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [src, onClose]);

  if (!src || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Фото"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <button
        onClick={onClose}
        aria-label="Закрыть фото"
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
      >
        <X className="size-6" />
      </button>
      <img src={src} alt={alt ?? "Фото к отметке"} className="max-h-full max-w-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}
