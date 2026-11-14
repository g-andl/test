"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/components/providers/AuthProvider";
import { MoodEmoji } from "@/components/mood/MoodEmoji";

/** Общая обёртка экранов входа. Вошедших пользователей отправляет в приложение. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { ready, session, recovery } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const stay = pathname.startsWith("/reset") || pathname.startsWith("/confirm") || recovery;

  useEffect(() => {
    if (ready && session && !stay) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    }
  }, [ready, session, stay, router]);

  return (
    <div className="flex min-h-dvh flex-col pt-safe lg:flex-row">
      {/* Левая панель только на компьютере */}
      <aside className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-accent p-12 text-white lg:flex">
        <span className="[&_span]:text-white">
          <Logo />
        </span>
        <div>
          <div className="mb-8 flex gap-3">
            {[5, 4, 3, 2, 1].map((v) => (
              <span key={v} className="flex size-16 items-center justify-center rounded-[20px] bg-white/95"><MoodEmoji value={v} size={44} decorative /></span>
            ))}
          </div>
          <h2 className="max-w-md text-4xl font-extrabold leading-tight tracking-tight">
            Узнавай себя. Замечай перемены. Будь ближе к друзьям.
          </h2>
        </div>
        <p className="text-sm text-white/70">Настрой — это дневник настроения, а не медицинское приложение.</p>
      </aside>
      <main className="flex flex-1 flex-col px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 sm:items-center sm:justify-center lg:px-12">
        <div className="mb-10 lg:hidden">
          <Logo />
        </div>
        <div className="w-full sm:max-w-sm">{children}</div>
        <Link href="/legal/" className="mx-auto mt-8 flex h-10 items-center text-[13px] font-semibold text-muted hover:text-text">
          Документы и конфиденциальность
        </Link>
      </main>
    </div>
  );
}
