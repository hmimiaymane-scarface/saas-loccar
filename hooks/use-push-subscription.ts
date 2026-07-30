"use client"

import { useCallback, useEffect, useState } from "react"

import { subscribeToPush, unsubscribeFromPush } from "@/app/(dashboard)/profile/actions"
import { extractSubscriptionKeys, supportsPush, urlBase64ToUint8Array } from "@/lib/push-client"

export interface UsePushSubscriptionResult {
  /** False on a browser with no Push API at all (Safari on macOS
   * before 16.4, most non-Chromium mobile browsers outside the
   * installed-PWA case). No point rendering an enable toggle there. */
  supported: boolean
  permission: NotificationPermission | null
  isSubscribed: boolean
  busy: boolean
  error: string | null
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

/**
 * Roadmap phase 44. Enabling push needs a real user gesture (browsers
 * refuse to auto-prompt `Notification.requestPermission()` on mount —
 * this hook only ever calls it from inside `subscribe()`, itself only
 * ever called from a click handler, never a `useEffect`). Mirrors
 * `lib/webauthn/client.ts`'s shape (a plain async function per action,
 * called by a component that owns its own busy/error state) closely
 * enough that `PushNotificationSection` reads like `PasskeySection`'s
 * sibling rather than a one-off.
 */
export function usePushSubscription(): UsePushSubscriptionResult {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supportsPush()) return
    // Reading navigator/Notification.permission can only happen after
    // mount (SSR has neither); no user event exists to move this into
    // instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(true)
    setPermission(Notification.permission)

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setIsSubscribed(subscription !== null))
      .catch(() => {})
  }, [])

  const subscribe = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const permissionResult = await Notification.requestPermission()
      setPermission(permissionResult)
      if (permissionResult !== "granted") {
        setError("Notifications were blocked — enable them in your browser's site settings to turn this on.")
        return
      }

      const registration = await navigator.serviceWorker.ready
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidPublicKey) {
        setError("Push isn't set up on this server yet.")
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
      const { p256dhKey, authKey } = extractSubscriptionKeys(subscription)

      const result = await subscribeToPush({
        endpoint: subscription.endpoint,
        p256dhKey,
        authKey,
        userAgent: navigator.userAgent,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setIsSubscribed(true)
    } catch {
      setError("Couldn't enable push notifications on this device. Try again.")
    } finally {
      setBusy(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        await unsubscribeFromPush(endpoint)
      }
      setIsSubscribed(false)
    } catch {
      setError("Couldn't turn off push notifications on this device. Try again.")
    } finally {
      setBusy(false)
    }
  }, [])

  return { supported, permission, isSubscribed, busy, error, subscribe, unsubscribe }
}
