import { redirect } from "next/navigation"

import { getSessionContext, toEmployee } from "@/lib/auth/session"
import { AppShell } from "@/components/layout/app-shell"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionContext()

  // middleware.ts already redirects unauthenticated / not-yet-onboarded
  // requests before they reach here; this is the defense-in-depth fallback
  // (e.g. Supabase configured but middleware skipped in a test harness).
  if (!session) {
    redirect("/sign-in")
  }

  return (
    <AppShell company={session.company} employee={toEmployee(session)}>
      {children}
    </AppShell>
  )
}
