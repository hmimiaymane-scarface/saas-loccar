"use client"

import { useEffect, useState } from "react"
import { Download, X, Share } from "lucide-react"

import { Button } from "@/components/ui/button"
import { trackUsageEvent } from "@/lib/analytics/track"

const DISMISS_KEY = "rentalos:install-prompt-dismissed"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

/** A phone-app-install nudge, not desktop chrome — rendered from the
 * mobile shell only. Chromium fires `beforeinstallprompt`, which this
 * captures and replays on tap; Safari never fires it (confirmed in
 * Next's own PWA guide) and has no programmatic install API at all, so
 * iOS gets manual "tap Share, then Add to Home Screen" instructions
 * instead — the same two-path approach Next's own guide recommends.
 * Dismissing is remembered in localStorage (this app's first use of
 * client-side persistence, deliberately no server round trip for a
 * purely local UI preference). */
function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    // Reading localStorage/navigator/matchMedia here (rather than in a
    // lazy useState initializer) is deliberate — these are browser-only
    // APIs unavailable during SSR, so the values must be read after
    // mount to avoid a hydration mismatch. There's no user-triggered
    // event to move this into instead; it's a one-time sync with the
    // browser environment, exactly the case react-hooks/set-state-in-effect's
    // own guidance calls "synchronizing with an external system."
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(localStorage.getItem(DISMISS_KEY) === "true")
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches)

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    // Roadmap phase 58 — the one reliable "actually installed" signal on
    // Chromium: userChoice's "accepted" fires even if the OS install is
    // later cancelled, appinstalled only fires once it genuinely completes.
    function onAppInstalled() {
      void trackUsageEvent("pwa_installed")
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onAppInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onAppInstalled)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "true")
    setDismissed(true)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    void trackUsageEvent("pwa_install_outcome", { metadata: { outcome } })
    if (outcome === "accepted") setDeferredPrompt(null)
  }

  if (isStandalone || dismissed) return null
  if (!deferredPrompt && !isIOS) return null

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Download className="size-4" />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <p className="font-medium text-foreground">Install RentalOS</p>
        {isIOS ? (
          <p className="text-xs text-muted-foreground">
            Tap <Share className="inline size-3.5 -translate-y-px" /> then &quot;Add to Home Screen&quot; for
            one-tap access in the field.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Add it to your home screen for one-tap access in the field.</p>
        )}
        {!isIOS && deferredPrompt && (
          <Button size="sm" className="mt-1 w-fit" onClick={install}>
            Install
          </Button>
        )}
      </div>
      <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Dismiss">
        <X className="size-4" />
      </Button>
    </div>
  )
}

export { InstallPrompt }
