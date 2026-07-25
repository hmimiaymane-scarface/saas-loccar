import type { NotificationChannel, NotificationChannelId } from "./types"

/**
 * Structural placeholder for a channel with no real integration yet.
 * Email, WhatsApp, SMS, and push are all real bible-listed delivery
 * channels, but each needs a third-party account and API key the owner
 * would have to set up — none exist anywhere in this repo today
 * (checked package.json and lib/env.ts before writing this). Rather than
 * fake a channel or silently drop it from the interface, this makes the
 * "not configured" state a real, honest value (`configured: false`) that
 * lib/notifications/service.ts#notify() checks before ever calling
 * `send` — so the architecture is genuinely exercised end-to-end (per
 * the phase brief's own instruction) without pretending a message was
 * ever sent.
 */
export function createUnconfiguredChannel(id: Exclude<NotificationChannelId, "in_app">): NotificationChannel {
  return {
    id,
    configured: false,
    async send() {
      // Intentionally inert — see the module comment above. Wiring up a
      // real provider means: add its API key to lib/env.ts, replace this
      // channel's `configured`/`send` with a real implementation, and
      // nothing else in lib/notifications/service.ts needs to change.
    },
  }
}
