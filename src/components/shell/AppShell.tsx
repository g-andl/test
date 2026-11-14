"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Plus, Bell as BellIcon } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { MoodSheetProvider, useMoodSheet } from "@/components/mood/MoodSheetProvider";
import { Spinner } from "@/components/ui/States";
import { Logo } from "@/components/Logo";
import { NAV, isActive } from "./nav";
import { useUnread } from "@/hooks/data";
import { supabase } from "@/lib/supabase";
import { invalidate } from "@/lib/query";
import { keys } from "@/lib/api";
import { asset } from "@/lib/paths";

/** Подписка на новые уведомления в реальном времени + счётчик на иконке приложения */
function useRealtime(uid: string | undefined, unread: number | undefined) {
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`notif-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, () => {
        invalidate(keys.unread, keys.notifications, keys.friends, keys.activity, keys.requests);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid]);

  // Бейдж на иконке PWA (Android, iOS 16.4+ на экране «Домой», десктоп)
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread === undefined || !nav.setAppBadge) return;
    (unread > 0 ? nav.setAppBadge(unread) : nav.clearAppBadge?.())?.catch(() => undefined);
  }, [unread]);
}

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-safe backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex h-[var(--nav-h)] max-w-xl items-stretch justify-around px-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, pathname);
          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex flex-1 flex-col items-center justify-center gap-1"
              >
                <span
                  className={`flex h-8 w-12 items-center justify-center rounded-full transition ${active ? "bg-accent-soft text-accent" : "text-muted"}`}
                >
                  <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className={`text-[11px] font-semibold leading-none ${active ? "text-accent" : "text-muted"}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const { data: unread = 0 } = useUnread();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-3">
        <Logo />
      </Link>
      <nav aria-label="Основная навигация" className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-12 items-center gap-3 rounded-2xl px-4 text-[15px] font-semibold transition ${active ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-surface-2"}`}
            >
              <Icon className="size-5" /> {label}
            </Link>
          );
        })}
        <Link
          href="/notifications/"
          aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
          className={`flex h-12 items-center gap-3 rounded-2xl px-4 text-[15px] font-semibold transition ${pathname.startsWith("/notifications") ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-surface-2"}`}
        >
          <BellIcon className="size-5" /> Уведомления
          {unread > 0 && (
            <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{unread}</span>
          )}
        </Link>
      </nav>
      {profile && (
        <p className="mt-auto truncate px-4 text-sm text-muted">
          @{profile.username}
        </p>
      )}
    </aside>
  );
}

/** Плавающая кнопка «+» в дневнике (на главной есть своя крупная кнопка) */
function Fab() {
  const openMood = useMoodSheet();
  const pathname = usePathname();
  if (!["/diary/"].includes(pathname.endsWith("/") ? pathname : `${pathname}/`)) return null;
  return (
    <button
      onClick={() => openMood()}
      aria-label="Отметить настроение"
      className="fixed bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+16px)] right-4 z-40 flex size-14 items-center justify-center rounded-[20px] bg-accent text-white shadow-[0_10px_30px_-6px_rgb(77_141_247/0.7)] transition active:scale-95 lg:hidden"
    >
      <Plus className="size-7" strokeWidth={2.5} />
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, session, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { data: unread } = useUnread();
  useRealtime(session?.user.id, unread);

  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace(`/login/?next=${encodeURIComponent(pathname)}`);
    else if (profile?.is_admin) router.replace("/admin/");
    else if (profile && !profile.onboarded) router.replace("/onboarding/");
  }, [ready, session, profile, router, pathname]);

  // Service Worker: офлайн-оболочка и push
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(asset("/sw.js"), { scope: asset("/") }).catch(() => undefined);
    }
  }, []);

  if (!ready || !session || !profile || !profile.onboarded || profile.is_admin) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <MoodSheetProvider>
      <Sidebar />
      <div className="pt-safe lg:pl-64">
        <main className="mx-auto w-full max-w-xl px-4 pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+28px)] min-[380px]:px-5 md:max-w-2xl lg:max-w-6xl lg:px-10 xl:px-14 lg:pb-16">
          {children}
        </main>
      </div>
      <Fab />
      <BottomNav />
    </MoodSheetProvider>
  );
}
