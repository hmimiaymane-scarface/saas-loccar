import { notificationChannels } from "./channels"
import type {
  NotificationChannel,
  NotificationChannelId,
  NotificationChannelPayload,
  NotificationChannelRecipient,
} from "./channels"

export interface NotifyInput extends NotificationChannelPayload {
  recipients: NotificationChannelRecipient[]
  /** Defaults to in-app only — the one channel guaranteed to work this
   * phase. Passing another channel id is safe even when it isn't
   * configured yet: an unconfigured channel is skipped, never thrown. */
  channels?: NotificationChannelId[]
}

/**
 * The TS-side notification platform service (roadmap phase 18
 * requirement 1) — any application-layer caller (a background job, the
 * AI chat route) uses this instead of writing to the `notifications`
 * table directly, the same role lib/activity-log.ts#recordEvent() plays
 * for activity_log and lib/ai/service.ts#askAI() plays for model calls.
 * SQL-side callers (SECURITY DEFINER RPCs) use public.notify() instead
 * (supabase/migrations/20260805090000_phase18_notification_service.sql),
 * since they can't call back into TS — both write the same shape.
 *
 * `channelRegistry` is only ever overridden by tests; real callers use
 * the default export from lib/notifications/channels.
 */
export async function notify(
  input: NotifyInput,
  channelRegistry: Record<NotificationChannelId, NotificationChannel> = notificationChannels
): Promise<void> {
  const channelIds = input.channels ?? ["in_app"]
  for (const recipient of input.recipients) {
    for (const channelId of channelIds) {
      const channel = channelRegistry[channelId]
      if (!channel.configured) continue
      await channel.send(input, recipient)
    }
  }
}
