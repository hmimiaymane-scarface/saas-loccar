import Link from "next/link"
import { redirect } from "next/navigation"
import { AlertTriangle, Building2 } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getInvitationPreview } from "@/lib/data"
import { ROLE_LABELS } from "@/lib/roles"
import { formatDate } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { AcceptInvitationButton } from "@/components/domain/invite/accept-invitation-button"

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const session = await getSessionContext()

  if (!session) {
    redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`)
  }

  const preview = await getInvitationPreview(token)

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-muted/40 px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
            RO
          </div>
          <span className="font-heading text-base font-medium text-foreground">Rental Office</span>
        </div>

        {!preview || preview.status !== "pending" || new Date(preview.expiresAt) < new Date() ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 pt-2 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400">
                <AlertTriangle className="size-5" />
              </div>
              <p className="text-sm text-foreground">
                {!preview
                  ? "This invitation link is invalid, or wasn't sent to your email address."
                  : preview.status !== "pending"
                    ? "This invitation has already been used or was revoked."
                    : "This invitation has expired — ask for a new one."}
              </p>
              <Link href="/overview" className="text-sm font-medium text-foreground hover:underline">
                Go to your Overview page
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-lg">
                <Building2 className="size-4" /> You&apos;re invited
              </CardTitle>
              <CardDescription>
                Join <strong className="text-foreground">{preview.companyName}</strong> as{" "}
                <strong className="text-foreground">{ROLE_LABELS[preview.role]}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">Expires {formatDate(preview.expiresAt)}</p>
              <AcceptInvitationButton token={token} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
