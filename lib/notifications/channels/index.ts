import { inAppChannel } from "./in-app"
import { createUnconfiguredChannel } from "./unconfigured"
import type { NotificationChannel, NotificationChannelId } from "./types"

export type { NotificationChannel, NotificationChannelId, NotificationChannelPayload, NotificationChannelRecipient } from "./types"

/**
 * Every delivery channel the platform service (lib/notifications/
 * service.ts) can dispatch to. `email` is called out separately from
 * whatsapp/sms/push in the roadmap phase 18 brief as "the next most
 * tractable addition" (no per-message cost, no dedicated messaging
 * account needed the way WhatsApp/SMS do) — but as of this phase it is
 * exactly as unconfigured as the other three: no email-sending package
 * or API key exists anywhere in this repo. All four use the same
 * honest placeholder rather than a fake distinction.
 */
export const notificationChannels: Record<NotificationChannelId, NotificationChannel> = {
  in_app: inAppChannel,
  email: createUnconfiguredChannel("email"),
  whatsapp: createUnconfiguredChannel("whatsapp"),
  sms: createUnconfiguredChannel("sms"),
  push: createUnconfiguredChannel("push"),
}
