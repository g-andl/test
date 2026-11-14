"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { TrendingUp, Users } from "lucide-react";
import { MoodEmoji } from "@/components/mood/MoodEmoji";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/States";
import { useToast } from "@/components/providers/ToastProvider";
import { updateProfile } from "@/lib/api";
import { humanError } from "@/lib/errors";

const SLIDES = [
  { visual: <span className="flex -space-x-3">{[5, 4, 3].map((v) => <MoodEmoji key={v} value={v} size={56} decorative />)}</span>, title: "Отмечай настроение", text: "Раз в день выбери, как ты себя чувствуешь. Можно добавить заметку и фото — они видны только тебе." },
  { visual: <TrendingUp className="size-14 text-accent" strokeWidth={2.2} />, title: "Замечай закономерности", text: "Календарь и статистика покажут, в какие дни и в какое время суток тебе лучше." },
  { visual: <Users className="size-14 text-accent" strokeWidth={2.2} />, title: "Будь ближе к друзьям", text: "Добавь друзей и смотри, как у них дела. Что показывать — решаешь ты сам." },
];

export default function OnboardingPage() {
  const { ready, session, profile, setProfile } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [i, setI] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace("/login/");
    else if (profile?.onboarded) router.replace("/");
  }, [ready, session, profile, router]);

  async function finish() {
    if (!profile || saving) return;
    setSaving(true);
    try {
      setProfile(await updateProfile(profile.id, { onboarded: true }));
      router.replace("/");
    } catch (e) {
      toast(humanError(e), "error");
      setSaving(false);
    }
  }

  if (!profile) return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex justify-end">
        {!last && (
          <button onClick={finish} className="h-11 px-2 text-[15px] font-semibold text-muted">
            Пропустить
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
          >
            <div className="mx-auto mb-8 flex size-36 items-center justify-center rounded-[40px] bg-accent-soft">
              {s.visual}
            </div>
            {i === 0 && <p className="mb-2 font-semibold text-accent">Привет, {profile.display_name}!</p>}
            <h1 className="text-[28px] font-extrabold tracking-tight">{s.title}</h1>
            <p className="mt-3 text-[17px] leading-relaxed text-text-2">{s.text}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mb-6 flex justify-center gap-2" aria-hidden>
        {SLIDES.map((_, k) => (
          <span key={k} className={`h-2 rounded-full transition-all ${k === i ? "w-6 bg-accent" : "w-2 bg-surface-3"}`} />
        ))}
      </div>
      <Button size="lg" block loading={saving} onClick={() => (last ? finish() : setI(i + 1))}>
        {last ? "Начать" : "Дальше"}
      </Button>
    </main>
  );
}
