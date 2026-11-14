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
        <Link href="/settings/privacy/" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface text-[15px] font-semibold shadow-card">
          <Settings2 className="size-5 text-accent" /> Кто может писать и видеть — в настройках приватности
        </Link>
      </div>
    </>
  );
}
