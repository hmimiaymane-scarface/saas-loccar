"use client"

import { useEffect } from "react"

import { logOperationalEvent } from "@/lib/observability/log"

/**
 * Roadmap phase 59 — mounted once from the root layout, same convention
 * as ServiceWorkerRegister. Next's `error.tsx`/`global-error.tsx`
 * boundaries only catch errors thrown during React's render/commit —
 * they never see an error thrown inside an async event handler,
 * `setTimeout`, or an un-awaited rejected promise (the classic
 * "unhandled rejection" case), confirmed by this app having no
 * `window.onerror`/`unhandledrejection` listener anywhere before this.
 * Those failures were previously invisible outside whatever browser
 * devtools console the user happened to have open — this closes that
 * gap without replacing the render-error boundaries, which stay as-is.
 *
 * Renders nothing; this is a side-effect-only component.
 */
function ErrorMonitor() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      void logOperationalEvent({
        source: "frontend",
        context: "window_error",
        message: event.message,
        metadata: { filename: event.filename ?? null, lineno: event.lineno ?? null },
      })
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : String(reason)
      void logOperationalEvent({
        source: "frontend",
        context: "unhandled_rejection",
        message,
      })
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return null
}

export { ErrorMonitor }
