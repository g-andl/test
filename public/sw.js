/* Service Worker «Настроение»: push-уведомления и офлайн-оболочка */
const CACHE = "nastroy-v1";
const SCOPE = self.registration.scope; // учитывает подпапку GitHub Pages

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SCOPE]).catch(() => undefined)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase и другие API — всегда в сеть

  // Статика сборки неизменна — сначала кэш
  if (url.pathname.includes("/_next/static/") || url.pathname.includes("/icons/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Страницы — сначала сеть, при обрыве — сохранённая копия
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(SCOPE))),
    );
  }
});

self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: "Настроение", body: e.data ? e.data.text() : "" };
  }
  const title = data.title || "Настроение";
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || "",
        icon: SCOPE + "icons/icon-192.png",
        badge: SCOPE + "icons/badge-96.png",
        tag: data.tag || undefined,
        data: { url: data.url || SCOPE },
      }),
      // Счётчик на иконке приложения
      typeof data.unread === "number" && self.navigator.setAppBadge
        ? self.navigator.setAppBadge(data.unread).catch(() => undefined)
        : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || SCOPE, SCOPE).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(SCOPE) && "focus" in c) {
          c.navigate(target).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
