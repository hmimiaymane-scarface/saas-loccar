"use client"

import { useTransition } from "react"
import { MessageCircle } from "lucide-react"

import { buildWhatsAppUrl } from "@/lib/whatsapp"
import { logCommunicationAction, type LogCommunicationInput } from "@/app/(dashboard)/customers/actions"
import { Button, type buttonVariants } from "@/components/ui/button"
import type { VariantProps } from "class-variance-authority"

interface WhatsAppButtonProps {
  phone: string | null | undefined
  message: string
  label: string
  /** Roadmap phase 46 — omit only for a WhatsApp action that genuinely
   * shouldn't appear on a customer's communication timeline; every
   * current call site passes one. */
  logEvent?: LogCommunicationInput
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
}

/**
 * Roadmap phase 45 — the one shared way a `wa.me` action renders
 * anywhere in this app, so every call site (reservation confirmation/
 * pickup/return/payment reminders, the contract "Send" action) looks
 * and behaves identically.
 *
 * Renders nothing when the phone doesn't normalize to something usable
 * (`buildWhatsAppUrl` returns `null`) — same "never a dead button for
 * a channel that isn't actually available" rule
 * `lib/notifications/actions.ts#callAndOpenActions` already follows,
 * rather than showing a button that 404s on click.
 *
 * Roadmap phase 46 — a client component now (was a plain server-
 * rendered `<a>`) so a click can fire `logCommunicationAction` without
 * ever blocking or delaying the actual `wa.me` navigation: the anchor's
 * own `target="_blank"` navigation is native and synchronous:
 * `onClick` starting an unawaited transition alongside it doesn't
 * intercept or slow it down.
 */
function WhatsAppButton({ phone, message, label, logEvent, variant = "outline", size }: WhatsAppButtonProps) {
  const [, startTransition] = useTransition()
  const url = buildWhatsAppUrl(phone, message)
  if (!url) return null

  function handleClick() {
    if (!logEvent) return
    startTransition(async () => {
      await logCommunicationAction(logEvent)
    })
  }

  return (
    <Button asChild variant={variant} size={size}>
      <a href={url} target="_blank" rel="noreferrer" onClick={handleClick}>
        <MessageCircle />
        {label}
      </a>
    </Button>
  )
}

export { WhatsAppButton }
