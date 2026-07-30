/**
 * Roadmap phase 45 (WhatsApp Operational Actions). WhatsApp's public
 * "click to chat" link (`https://wa.me/<phone>?text=<message>`) needs
 * no API key, no Business account, no webhook — it just opens WhatsApp
 * (web or app) with a draft message the human still has to review and
 * press send on. This is deliberately the entire integration this
 * phase builds: the brief's own "do not over-automate before templates
 * and consent behavior are validated" instruction is satisfied by
 * construction here, not by a separate consent-gate mechanism — nothing
 * is ever sent without a human in the loop clicking Send inside
 * WhatsApp itself.
 *
 * Existing `tel:` links elsewhere in this app (`customer-list-item.tsx`,
 * `pickup-wizard.tsx`) interpolate the raw stored phone string
 * unchanged — harmless for `tel:` (phone dialers tolerate spaces/dashes),
 * but `wa.me` requires digits only, country code included, no `+`, no
 * spaces/dashes. This is the one normalizer that actually matters for
 * that requirement.
 */

/** Strips everything but digits. Returns `null` for anything too short
 * to plausibly be a real phone number (a bare local extension, an
 * empty string) rather than building a `wa.me` link that would 404. */
export function normalizePhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  return digits.length >= 8 ? digits : null
}

/** `null` when the phone doesn't normalize to something usable — the
 * caller's job to render nothing rather than a dead link (same "never
 * a dead button" rule `callAndOpenActions` already follows). */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone)
  if (!normalized) return null
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}
