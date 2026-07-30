// Roadmap phase 16 — hand-rolled, not a library (Serwist, the option
// Next's own PWA guide recommends for offline support, requires webpack
// configuration; this repo builds with Turbopack). Deliberately small
// and precisely scoped to what this phase actually needs — no attempt
// at a blanket offline mode for the whole app (see docs/mobile.md).
//
// Three strategies, chosen per request:
//   1. Same-origin hashed static assets (/_next/static/*) — cache-first.
//      Safe by construction: Next hashes these filenames, so a cached
//      response for a given URL can never go stale under a different
//      meaning.
//   2. Navigation requests (HTML page loads) to the two offline-critical
//      routes (/reservations/*/pickup, /reservations/*/return) and the
//      mobile shell's own routes — network-first, falling back to the
//      last cached response for that exact URL, and finally to /offline
//      if nothing was ever cached. This is what lets a PWA reopened
//      while offline still show a real page instead of a browser error,
//      for anything the employee actually visited earlier today.
//   3. Everything else (API routes, Supabase calls, other navigations)
//      — untouched, goes straight to the network. Mutating requests are
//      never cached; offline resilience for those is handled entirely
//      by the app-level IndexedDB queue (lib/offline/), not by this
//      service worker.
//
// Roadmap phase 44 adds two more listeners below (`push`,
// `notificationclick`) — an unrelated concern from the fetch-caching
// strategies above (a push can arrive with no page open at all), kept
// in this same file since a PWA has exactly one service worker, not
// one per feature.

const STATIC_CACHE = "rentalos-static-v1"
const PAGE_CACHE = "rentalos-pages-v1"
const OFFLINE_URL = "/offline"

const OFFLINE_CRITICAL_PATTERNS = [/^\/reservations\/[^/]+\/pickup/, /^\/reservations\/[^/]+\/return/, /^\/home$/]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

function isOfflineCriticalNavigation(url) {
  return OFFLINE_CRITICAL_PATTERNS.some((pattern) => pattern.test(url.pathname))
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // 1. Hashed static assets — cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      })
    )
    return
  }

  // 2. Navigations to the offline-critical routes — network-first,
  // falling back to cache, then to the offline page.
  if (request.mode === "navigate" && isOfflineCriticalNavigation(url)) {
    event.respondWith(
      caches.open(PAGE_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request)
          if (response.ok) cache.put(request, response.clone())
          return response
        } catch {
          const cached = await cache.match(request)
          return cached ?? (await cache.match(OFFLINE_URL))
        }
      })
    )
    return
  }

  // 3. Everything else — network only, no interception.
})

// Roadmap phase 44 (Push Notifications) — the payload is whatever
// lib/notifications/channels/push.ts sent as its message body:
// { title, body, url, tag }. `tag` collapses repeat pushes for the
// same underlying thing (e.g. re-running the reminder cron) into one
// notification instead of stacking duplicates in the OS tray.
self.addEventListener("push", (event) => {
  let payload = { title: "RentalOS", body: "", url: "/overview", tag: undefined }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Malformed/non-JSON payload — still show *something* rather than
    // silently dropping the push.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/192",
      badge: "/icons/192",
      data: { url: payload.url },
    })
  )
})

// The actual deep-link: focus an already-open tab on the right page if
// one exists (avoids opening a confusing second copy of the app),
// otherwise open a new one. This is what "deep-links to the exact
// action" (this phase's own acceptance criterion) means in practice.
self.addEventListener("notificationclick", (event) => {
  const targetUrl = event.notification.data?.url ?? "/overview"
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url)
        if (clientUrl.pathname === new URL(targetUrl, self.location.origin).pathname && "focus" in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
