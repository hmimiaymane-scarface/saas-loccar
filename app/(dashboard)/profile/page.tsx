import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { listPasskeys } from "@/app/(dashboard)/profile/actions"
import { isSupabaseConfigured } from "@/lib/env"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { PasskeySection } from "@/components/domain/profile/passkey-section"
import { PushNotificationSection } from "@/components/domain/profile/push-notification-section"

const roleLabel: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  agent: "Agent",
  accountant: "Accountant",
  driver: "Driver",
}

/** Roadmap phase 16 — personal settings any signed-in employee can
 * reach (unlike /settings, which is company-wide and owner/manager
 * only). Reachable from UserMenu's own "Profile" item in both shells. */
export default async function ProfilePage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const passkeys = isSupabaseConfigured ? await listPasskeys().catch(() => []) : []

  return (
    <>
      <SectionHeader title="Profile" description="Your account and sign-in preferences" />
      <Card>
        <CardHeader>
          <CardTitle>{session.profile.fullName ?? "Your account"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>{session.email}</span>
          <span>{roleLabel[session.role] ?? session.role}</span>
        </CardContent>
      </Card>
      <PasskeySection passkeys={passkeys} />
      <PushNotificationSection />
    </>
  )
}
