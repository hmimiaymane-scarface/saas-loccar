import { redirect } from "next/navigation"
import { Ban } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { signOut } from "@/app/(auth)/actions"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/** Reached only when middleware has already confirmed the signed-in
 * user's company is suspended (see is_company_suspended() and
 * lib/supabase/middleware.ts) — this page itself doesn't re-check
 * anything, it's purely informational. No tenant data is touched; a
 * platform admin reactivating the company is all it takes for this
 * redirect to stop firing. */
export default async function AccountSuspendedPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-muted/40 px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
            RO
          </div>
          <span className="font-heading text-base font-medium text-foreground">Rental Office</span>
        </div>

        <Card>
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-full bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400">
              <Ban className="size-5" />
            </div>
            <CardTitle className="text-lg">Account access paused</CardTitle>
            <CardDescription>
              Access to <strong className="text-foreground">{session.company.name}</strong> has been paused. Your
              data is safe and nothing has been deleted — this is only an access pause.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Contact whoever manages your Rental Office subscription to have access restored.
            </p>
            <form action={signOut}>
              <Button type="submit" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
