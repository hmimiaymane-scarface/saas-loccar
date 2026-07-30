"use client"

import { Bell, BellOff, Loader2 } from "lucide-react"

import { usePushSubscription } from "@/hooks/use-push-subscription"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

/**
 * Roadmap phase 44 — the one place a user opts a device into push
 * (late return, upcoming pickup/return, outstanding balance, a new
 * booking request, a missing document). Per-device, not company-wide
 * (matches `PasskeySection`'s reasoning exactly: this is a personal
 * setting, and `push_subscriptions` RLS already only lets a user see/
 * manage their own rows regardless).
 */
function PushNotificationSection() {
  const { supported, permission, isSubscribed, busy, error, subscribe, unsubscribe } = usePushSubscription()

  if (!supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Push notifications</CardTitle>
          <CardDescription>Not supported on this browser.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Push notifications</CardTitle>
        <CardDescription>
          Get notified on this device for a late return, an upcoming pickup or return, an outstanding balance, a new
          booking request, or a missing document — without needing to have RentalOS open.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {permission === "denied" ? (
          <p className="text-xs text-muted-foreground">
            Notifications are blocked for this site — enable them in your browser&apos;s site settings, then reload
            this page.
          </p>
        ) : isSubscribed ? (
          <Button type="button" variant="outline" onClick={unsubscribe} disabled={busy} className="w-fit">
            {busy ? <Loader2 className="animate-spin" /> : <BellOff />}
            Turn off on this device
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={subscribe} disabled={busy} className="w-fit">
            {busy ? <Loader2 className="animate-spin" /> : <Bell />}
            Enable on this device
          </Button>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

export { PushNotificationSection }
