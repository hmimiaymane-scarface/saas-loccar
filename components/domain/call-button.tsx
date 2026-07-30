"use client"

import { useTransition } from "react"
import { Phone } from "lucide-react"

import { logCommunicationAction, type LogCommunicationInput } from "@/app/(dashboard)/customers/actions"
import { Button, type buttonVariants } from "@/components/ui/button"
import type { VariantProps } from "class-variance-authority"

interface CallButtonProps {
  phone: string
  /** Roadmap phase 46 — see `WhatsAppButton`'s identical prop for the
   * reasoning; every current call site passes one. */
  logEvent?: LogCommunicationInput
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
}

/**
 * Roadmap phase 46 — a `tel:` link previously rendered inline and
 * un-logged everywhere in this app (`customer-list-item.tsx`,
 * `pickup-wizard.tsx`, the reservation detail page). This is the first
 * shared version, and the only one that logs a `call_logged` entry —
 * "logged" here means "staff clicked Call," the only moment this app
 * can actually observe (it has no way to know if the call was
 * answered). Existing raw `tel:` links elsewhere are unaffected;
 * adopting this component there is a separate, later choice.
 */
function CallButton({ phone, logEvent, variant = "outline", size }: CallButtonProps) {
  const [, startTransition] = useTransition()

  function handleClick() {
    if (!logEvent) return
    startTransition(async () => {
      await logCommunicationAction(logEvent)
    })
  }

  return (
    <Button asChild variant={variant} size={size}>
      <a href={`tel:${phone}`} onClick={handleClick}>
        <Phone />
        Call
      </a>
    </Button>
  )
}

export { CallButton }
