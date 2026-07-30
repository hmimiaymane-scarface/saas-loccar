import { inAppChannel } from "./in-app"
import { pushChannel } from "./push"
import { createUnconfiguredChannel } from "./unconfigured"
import type { NotificationChannel, NotificationChannelId } from "./types"

export type { NotificationChannel, NotificationChannelId, NotificationChannelPayload, NotificationChannelRecipient } from "./types"

/**
 * Every delivery channel the platform service (lib/notifications/
 * service.ts) can dispatch to. `email` is called out separately from
 * whatsapp/sms/push in the roadmap phase 18 brief as "the next most
 * tractable addition" (no per-message cost, no dedicated messaging
 * account needed the way WhatsApp/SMS do) — but as of that phase it was
 * exactly as unconfigured as the other three: no email-sending package
 * or API key existed anywhere in this repo. Those three still use the
 * same honest placeholder; `push` (roadmap phase 44) is the first of
 * the four to get a real implementation — `pushChannel`'s own
 * `configured` flag is `false` until real VAPID keys exist
 * (`lib/env.ts#isPushConfigured`), so an unconfigured deployment
 * behaves exactly like before this phase.
 */
export const notificationChannels: Record<NotificationChannelId, NotificationChannel> = {
  in_app: inAppChannel,
  email: createUnconfiguredChannel("email"),
  whatsapp: createUnconfiguredChannel("whatsapp"),
  sms: createUnconfiguredChannel("sms"),
  push: pushChannel,
}
