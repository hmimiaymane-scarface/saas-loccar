import { MessageCircle } from "lucide-react"

import { buildWhatsAppUrl } from "@/lib/whatsapp"
import { Button, type buttonVariants } from "@/components/ui/button"
import type { VariantProps } from "class-variance-authority"

interface WhatsAppButtonProps {
  phone: string | null | undefined
  message: string
  label: string
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
}

/**
 * Roadmap phase 45 — the one shared way a `wa.me` action renders
 * anywhere in this app, so every call site (reservation confirmation/
 * pickup/return/payment reminders, the contract "Send" action) looks
 * and behaves identically. No server component boundary needed — this
 * is a plain link, not an interactive client widget.
 *
 * Renders nothing when the phone doesn't normalize to something usable
 * (`buildWhatsAppUrl` returns `null`) — same "never a dead button for
 * a channel that isn't actually available" rule
 * `lib/notifications/actions.ts#callAndOpenActions` already follows,
 * rather than showing a button that 404s on click.
 */
function WhatsAppButton({ phone, message, label, variant = "outline", size }: WhatsAppButtonProps) {
  const url = buildWhatsAppUrl(phone, message)
  if (!url) return null

  return (
    <Button asChild variant={variant} size={size}>
      <a href={url} target="_blank" rel="noreferrer">
        <MessageCircle />
        {label}
      </a>
    </Button>
  )
}

export { WhatsAppButton }
