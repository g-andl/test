"use client";
import Link from "next/link";
import { Globe, Lock, Users } from "lucide-react";
import { useQuery } from "@/lib/query";
import { fetchPrivacy, keys } from "@/lib/api";

const WHO = {
  all: { icon: Globe, text: "Видят все" },
  friends: { icon: Users, text: "Видят друзья" },
  me: { icon: Lock, text: "Видишь только ты" },
} as const;

/** Подпись под итогами дня: кто их видит; ведёт в настройки приватности */
export function VisibilityNote() {
  const privacy = useQuery(keys.privacy, fetchPrivacy);
  const who = WHO[privacy.data?.reflections_visibility ?? "all"];
  return (
    <Link href="/settings/privacy/" className="mt-0.5 flex min-h-8 w-fit items-center gap-1.5 text-[13px] text-muted hover:text-text">
      <who.icon className="size-3.5" /> {who.text} · изменить
    </Link>
  );
}
