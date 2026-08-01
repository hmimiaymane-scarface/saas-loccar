import { createAdminClient } from "@/lib/supabase/admin"
import { runNotificationRemindersForCompany, type ReminderRunSummary } from "@/lib/notifications/reminders"
import { logOperationalEventAsAdmin } from "@/lib/observability/log-admin"

export const maxDuration = 60

/**
 * Roadmap phase 44 — the scheduled trigger for push reminders (late
 * return, upcoming pickup/return, outstanding balance, missing
 * document). Same shape as `app/api/cron/operations-feed/route.ts`
 * (phase 12): `Authorization: Bearer $CRON_SECRET` (Vercel's own
 * documented cron-auth pattern), the service-role admin client (no
 * session exists for this request), one company at a time with a
 * per-company try/catch so one tenant's failure never stops the rest.
 *
 * Runs far more often than the daily Operations Feed cron (see
 * `vercel.json`) — "upcoming pickup in the next 2 hours" needs
 * near-real-time granularity a once-a-day sweep can't provide.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 500 })
  }
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, timezone, overdue_grace_period_hours")
    .eq("status", "active")
  if (error) {
    void logOperationalEventAsAdmin({
      companyId: null,
      source: "cron_job",
      context: "notification-reminders",
      message: error.message,
    })
    return Response.json({ error: error.message }, { status: 500 })
  }

  const results: (ReminderRunSummary | { companyId: string; error: string })[] = []
  for (const company of companies ?? []) {
    try {
      results.push(
        await runNotificationRemindersForCompany(supabase, company.id, company.timezone, company.overdue_grace_period_hours)
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      results.push({ companyId: company.id, error: message })
      void logOperationalEventAsAdmin({
        companyId: company.id,
        source: "cron_job",
        context: "notification-reminders",
        message,
      })
    }
  }

  return Response.json({ ranAt: new Date().toISOString(), companiesProcessed: results.length, results })
}
