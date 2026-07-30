/**
 * Roadmap phase 44 (Push Notifications). Pure browser-side helpers —
 * no React, so `hooks/use-push-subscription.ts` stays a thin wrapper
 * and this half is trivially readable on its own.
 */

/** The Web Push spec wants the VAPID public key as a raw Uint8Array,
 * but env vars/URLs only carry strings — this is the standard
 * base64url-to-Uint8Array conversion every Web Push client needs. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function supportsPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
}

/** The two Web Push keys the browser generates per subscription,
 * pulled out of `PushSubscription.toJSON()`'s nested shape into the
 * flat fields `push_subscriptions` actually stores. */
export function extractSubscriptionKeys(subscription: PushSubscription): { p256dhKey: string; authKey: string } {
  const json = subscription.toJSON()
  return {
    p256dhKey: json.keys?.p256dh ?? "",
    authKey: json.keys?.auth ?? "",
  }
}
