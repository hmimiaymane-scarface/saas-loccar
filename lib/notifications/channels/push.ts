import webpush from "web-push"

import { createAdminClient } from "@/lib/supabase/admin"
import { isPushConfigured, pushEnv } from "@/lib/env"
import type { NotificationChannel } from "./types"

/**
 * Roadmap phase 44 (Push Notifications). The real `send()` for the
 * `push` channel id — until this phase, `push` was one of four
 * identically-inert placeholders (`lib/notifications/channels/unconfigured.ts`)
 * phase 18 built the channel-agnostic architecture around but never
 * implemented.
 *
 * Uses the service-role admin client, not the session-bound client
 * `in-app.ts` uses — `in-app.ts`'s own comment already flags this
 * exact gap ("a background job notifying someone else needs the
 * service-role admin client instead"), and push notifications are
 * overwhelmingly triggered by the reminder cron (`lib/notifications/reminders.ts`)
 * about OTHER users' reservations, not the current signed-in session.
 *
 * A recipient may have zero, one, or several subscriptions (one per
 * device they've enabled push on) — sent to all of them in parallel,
 * every one independently. A subscription the push service reports as
 * gone (404/410 — the browser un-registered it, the user uninstalled
 * the PWA, etc.) is deleted here so it stops being retried forever;
 * any other failure is swallowed per-subscription (one dead device
 * must never block push to the recipient's other devices, nor crash
 * the caller — same "one unit of work's failure doesn't stop the
 * rest" convention as the operations-feed cron).
 */
export const pushChannel: NotificationChannel = {
  id: "push",
  configured: isPushConfigured,
  async send(payload, recipient) {
    const supabase = createAdminClient()
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key")
      .eq("user_id", recipient.userId)

    if (error || !subscriptions || subscriptions.length === 0) return

    const message = JSON.stringify({
      title: payload.title,
      body: payload.description ?? "",
      url: payload.linkHref ?? "/overview",
      tag: payload.key ?? `${payload.type}:${recipient.userId}`,
    })

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
            },
            message,
            {
              vapidDetails: {
                subject: pushEnv.vapidSubject,
                publicKey: pushEnv.vapidPublicKey,
                privateKey: pushEnv.vapidPrivateKey,
              },
            }
          )
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id)
          }
          // Any other failure (network blip, push service outage) is
          // swallowed — this is fire-and-forget best-effort delivery,
          // never something that should crash the caller (the reminder
          // cron, or an event-triggered notify() call mid-request).
        }
      })
    )
  },
}
