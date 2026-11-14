"use client";
import { useEffect, useState } from "react";
import { BellRing, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { enablePush, disablePushOnDevice, currentSubscription, pushSupport, type PushSupport } from "@/lib/push";
import { updateNotifSettings, fetchNotifSettings, keys } from "@/lib/api";
import { useQuery, setQueryData } from "@/lib/query";
import { humanError } from "@/lib/errors";

/** Хук состояния push на этом устройстве */
function usePushState() {
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- возможности браузера известны только на клиенте
    setSupport(pushSupport());
    currentSubscription()
      .then((s) => setSubscribed(!!s && Notification.permission === "granted"))
      .catch(() => undefined)
      .finally(() => setChecked(true));
  }, []);
  return { support, subscribed, setSubscribed, checked };
}

/** Баннер-приглашение включить push (не показываем сразу после регистрации — только здесь) */
export function PushBanner() {
  const { support, subscribed, setSubscribed, checked } = usePushState();
  const { session } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- пользователь мог скрыть баннер раньше
      if (localStorage.getItem("nastroy-push-banner") === "hidden") setHidden(true);
    } catch {}
  }, []);

  if (!checked || subscribed || hidden || support === "unsupported" || support === "not-configured") return null;

  async function on() {
    setBusy(true);
    try {
      await enablePush();
      const s = await updateNotifSettings(session!.user.id, { push_enabled: true });
      setQueryData(keys.notifSettings, () => s);
      setSubscribed(true);
      toast("Push-уведомления включены");
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-[24px] bg-accent-soft p-4">
      <div className="flex gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-white">
          {support === "ios-needs-install" ? <Smartphone className="size-5" /> : <BellRing className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="font-bold">Узнавай первым, как дела у друзей</p>
          <p className="mt-0.5 text-sm text-text-2">
            {support === "ios-needs-install"
              ? "На iPhone: нажми «Поделиться» → «На экран Домой», открой приложение с экрана и включи уведомления."
              : "Включи push — придут, даже когда приложение закрыто. Заметки и фото в них не показываются."}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setHidden(true);
            try { localStorage.setItem("nastroy-push-banner", "hidden"); } catch {}
          }}
        >
          Не сейчас
        </Button>
        {support === "supported" && (
          <Button size="sm" variant="accent" className="flex-1" loading={busy} onClick={on}>
            Включить
          </Button>
        )}
      </div>
    </div>
  );
}

/** Переключатель push в настройках */
export function PushToggle() {
  const { support, subscribed, setSubscribed, checked } = usePushState();
  const { session } = useAuth();
  const toast = useToast();
  const settings = useQuery(keys.notifSettings, fetchNotifSettings);
  const [busy, setBusy] = useState(false);
  const enabled = !!settings.data?.push_enabled && subscribed;

  async function change(v: boolean) {
    setBusy(true);
    try {
      if (v) await enablePush();
      else await disablePushOnDevice();
      const s = await updateNotifSettings(session!.user.id, { push_enabled: v });
      setQueryData(keys.notifSettings, () => s);
      setSubscribed(v);
      toast(v ? "Push-уведомления включены" : "Push-уведомления выключены");
    } catch (e) {
      toast(humanError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const description =
    support === "not-configured"
      ? "Push пока не настроены на сервере (нужен VAPID-ключ)"
      : support === "ios-needs-install"
        ? "На iPhone сначала добавь приложение на экран «Домой»"
        : support === "unsupported"
          ? "Этот браузер не поддерживает push-уведомления"
          : "Приходят, даже когда приложение закрыто. Без заметок и фото.";

  return (
    <Toggle
      label="Push-уведомления на этом устройстве"
      description={description}
      checked={enabled}
      disabled={!checked || busy || support !== "supported"}
      onChange={change}
    />
  );
}
