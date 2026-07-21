"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const IDLE_TIMEOUT_MS = 30 * 60 * 1000
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "visibilitychange"] as const

/**
 * Roadmap phase 16 requirement 8's "automatic session expiration" for
 * the mobile context specifically — an installed PWA left unattended
 * in the field (handed to a customer, left on a counter) is a real
 * shared-device risk in a way an office desktop generally isn't.
 * Client-side only: this redirects to /sign-in after 30 idle minutes
 * while running in `display-mode: standalone`, forcing the sign-in
 * screen (and, per this phase, a fast passkey re-auth) back in front
 * of anyone still holding the device — it does not revoke the
 * underlying Supabase session server-side, which is a heavier change
 * this checkpoint doesn't attempt (the existing session still refreshes
 * normally in the browser tab itself if the user navigates back before
 * its own natural expiry). Never active on desktop or a plain mobile
 * browser tab (only `standalone` display-mode), so ordinary desktop use
 * is completely unaffected.
 */
export function useIdleRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (!window.matchMedia("(display-mode: standalone)").matches) return

    let timer: ReturnType<typeof setTimeout>

    function reset() {
      clearTimeout(timer)
      timer = setTimeout(() => router.push("/sign-in"), IDLE_TIMEOUT_MS)
    }

    reset()
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, reset)

    return () => {
      clearTimeout(timer)
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, reset)
    }
  }, [router])
}
