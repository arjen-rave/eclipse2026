// Bump this string on every deploy — it's what forces the browser to detect this
// file as changed, run the update lifecycle, and purge the previous cache. Without a
// change here, Chrome won't even notice a new service worker exists (it byte-diffs
// this file), so old cached content keeps being served indefinitely.
const CACHE_NAME = "eclipse2026-v13";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./besselian-2026-08-12.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Displays a real push message sent by .github/scripts/send-reminders.js (or the
// Cloudflare Worker's test path) via web-push. Without this listener, an incoming
// 'push' event is silently dropped — the send itself can succeed (the push service
// accepts the payload) while nothing ever appears on screen, since displaying it is
// this service worker's job, not the sender's.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Eclipse reminder", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Eclipse reminder", {
      body: data.body || "",
      icon: "icons/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});
