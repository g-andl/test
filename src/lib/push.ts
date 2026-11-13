// Web Push: подписка устройства и её сохранение в базе.
import { supabase } from "./supabase";
import { asset } from "./paths";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export type PushSupport = "supported" | "unsupported" | "ios-needs-install" | "not-configured";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!VAPID) return "not-configured";
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // На iPhone push работает только после «На экран Домой»
    return isIOS && !standalone ? "ios-needs-install" : "unsupported";
  }
  return "supported";
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration(asset("/"))) ?? null;
}

/** Текущая подписка этого устройства */
export async function currentSubscription() {
  const reg = await getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Запросить разрешение и подписать устройство. Вызывать только по нажатию пользователя. */
export async function enablePush(): Promise<void> {
  const support = pushSupport();
  if (support === "not-configured") throw new Error("Push-уведомления пока не настроены на сервере");
  if (support === "ios-needs-install")
    throw new Error("На iPhone добавьте приложение на экран «Домой» через меню «Поделиться», затем включите push");
  if (support !== "supported") throw new Error("Этот браузер не поддерживает push-уведомления");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Разрешение на уведомления не выдано. Его можно включить в настройках браузера.");

  const reg = (await getRegistration()) ?? (await navigator.serviceWorker.register(asset("/sw.js"), { scope: asset("/") }));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID),
    });
  }
  const { error } = await supabase.rpc("save_push_subscription", {
    p_subscription: sub.toJSON(),
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

/** Отписать это устройство */
export async function disablePushOnDevice(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe().catch(() => undefined);
}
