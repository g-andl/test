"use client";
import { PageHeader } from "@/components/shell/PageHeader";
import { SupportWallCard } from "@/components/support/SupportWall";
import { useAuth } from "@/components/providers/AuthProvider";
import Link from "next/link";
import { Settings2 } from "lucide-react";

/** Мои сообщения в окне поддержки */
export default function MySupportPage() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <>
      <PageHeader back title="Окно поддержки" bell={false} />
      <div className="flex flex-col gap-4 lg:max-w-2xl">
        <SupportWallCard userId={profile.id} ownerName={profile.display_name} own />
        <Link
          href="/settings/privacy/"
          className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left text-[15px] font-semibold leading-snug shadow-card"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Settings2 className="size-5" />
          </span>
          <span className="min-w-0 flex-1">Кто может писать и видеть — в настройках приватности</span>
        </Link>
      </div>
    </>
  );
}
