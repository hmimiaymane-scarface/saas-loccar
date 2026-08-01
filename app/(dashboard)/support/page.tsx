import { redirect } from "next/navigation"
import { MessageCircle, Mail } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { supportEnv } from "@/lib/env"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { FeedbackForm } from "@/components/domain/support/feedback-form"

/**
 * Roadmap phase 63 (Pilot Onboarding Package) — the "backup contact
 * method for issues" + "feedback capture" pieces of the pilot
 * onboarding package. No role gate beyond being signed in — everyone
 * on a team should be able to ask for help or say something's wrong,
 * not just an owner/manager.
 */
export default async function SupportPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const hasWhatsapp = Boolean(supportEnv.whatsapp)
  const hasEmail = Boolean(supportEnv.email)

  return (
    <>
      <SectionHeader title="Help & Support" description="Something broke, or something's unclear? Reach us directly." />

      <Card>
        <CardHeader>
          <CardTitle>Need help right now?</CardTitle>
          <CardDescription>
            If the app itself is unreachable, this is the one thing to remember: message or email us.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!hasWhatsapp && !hasEmail && (
            <p className="text-sm text-muted-foreground">
              No support contact is configured yet — set NEXT_PUBLIC_SUPPORT_WHATSAPP and/or
              NEXT_PUBLIC_SUPPORT_EMAIL (see .env.example).
            </p>
          )}
          {hasWhatsapp && (
            <a
              href={`https://wa.me/${supportEnv.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-border p-4 transition-colors hover:bg-muted"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <MessageCircle className="size-5 text-foreground" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">WhatsApp</span>
                <span className="text-xs text-muted-foreground">+{supportEnv.whatsapp}</span>
              </span>
            </a>
          )}
          {hasEmail && (
            <a
              href={`mailto:${supportEnv.email}`}
              className="flex items-center gap-3 rounded-2xl border border-border p-4 transition-colors hover:bg-muted"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <Mail className="size-5 text-foreground" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">Email</span>
                <span className="text-xs text-muted-foreground">{supportEnv.email}</span>
              </span>
            </a>
          )}
        </CardContent>
      </Card>

      <FeedbackForm />
    </>
  )
}
