"use client"

import { useEffect } from "react"

/** Mounted once from the root layout. Registers public/sw.js — see that
 * file's own doc comment for exactly what it caches and why. Renders
 * nothing; this is a side-effect-only component. */
function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Best-effort — a failed registration (unsupported browser,
      // blocked by an extension, etc.) should never break the app
      // itself, only forgo the offline/installability benefits.
    })
  }, [])

  return null
}

export { ServiceWorkerRegister }
