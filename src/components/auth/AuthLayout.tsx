"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/components/providers/AuthProvider";

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
          <p className="emoji mb-6 text-6xl">😄 🙂 😐 😔 😣</p>
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
      </main>
    </div>
  );
}
