"use client"

import { useEffect } from "react"

/**
 * Mounted once from the root layout. Registers public/sw.js — see that
 * file's own doc comment for exactly what it caches and why. Renders
 * nothing; this is a side-effect-only component.
 *
 * Roadmap phase 68 (Pilot Release Candidate) — reliability fix for a
 * gap phase 62 identified but didn't yet close: `sw.js`'s `install`
 * handler calls `self.skipWaiting()` and its `activate` handler calls
 * `self.clients.claim()`, so a new service-worker version takes
 * control of every already-open tab immediately after a deploy — the
 * classic "skipWaiting without a matching reload" PWA trap. Without
 * this listener, an already-open tab keeps running its OLD in-memory
 * JS module graph while network requests silently start routing
 * through the NEW worker; the first client-side navigation to a route
 * whose chunk wasn't already loaded can then fail with a "module
 * factory is not available" class of error — invisible to the user
 * until they happen to hit it, exactly the risk phase 62 flagged
 * ("a feature could go silently, invisibly non-functional... with zero
 * visible error"), and the same error shape this session's own
 * browser-automation testing hit repeatedly from a stale dev-server
 * cache (a different trigger, identical symptom).
 *
 * `controllerchange` fires exactly once per real handover — reloading
 * there picks up the new build cleanly. Guarded against a double-fire
 * (the event can fire more than once in some browsers/edge cases).
 * Also re-checks for an update whenever the tab regains focus — a PWA
 * left open across a deploy would otherwise only notice on the
 * browser's own infrequent (often ~24h) background check.
 *
 * Known, accepted tradeoff: a reload can lose unsaved input in a plain
 * form field the user was mid-typing (this doesn't affect the pickup/
 * return offline queue, which already persists to IndexedDB
 * independent of page lifecycle) — judged strictly better than the
 * alternative (a silently broken feature with no way for the user to
 * even know why), not solved with a confirmation prompt here, since
 * that would be new UI, not a bug fix.
 */
function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    let reloading = false
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        function checkForUpdate() {
          if (document.visibilityState === "visible") void registration.update()
        }
        document.addEventListener("visibilitychange", checkForUpdate)
      })
      .catch(() => {
        // Best-effort — a failed registration (unsupported browser,
        // blocked by an extension, etc.) should never break the app
        // itself, only forgo the offline/installability benefits.
      })
  }, [])

  return null
}

export { ServiceWorkerRegister }
