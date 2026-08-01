import { createAdminClient } from "@/lib/supabase/admin"
import { runOperationsFeedForCompany, type OperationsFeedRunSummary } from "@/lib/operations-feed/run"
import { logOperationalEventAsAdmin } from "@/lib/observability/log-admin"

export const maxDuration = 60

/**
 * Roadmap phase 12 requirement 1 — the scheduled trigger for the
 * Operations Feed. Vercel Cron (see `vercel.json`) hits this on a
 * schedule with `Authorization: Bearer $CRON_SECRET` automatically
 * attached — Vercel's own documented pattern for authenticating cron
 * requests, verified here the same way. No session/cookies exist for
 * this request at all, which is exactly why `lib/supabase/admin.ts`'s
 * service-role client exists (see its own doc comment).
 *
 * The actual per-company logic (`runOperationsFeedForCompany`) is a
 * plain importable function, not something only reachable via this
 * route — `app/(dashboard)/operations-feed/actions.ts`'s dev-only
 * "run now" action calls it directly too, so the job can be tested
 * without waiting for the schedule or deploying to Vercel at all.
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
  const { data: companies, error } = await supabase.from("companies").select("id").eq("status", "active")
  if (error) {
    void logOperationalEventAsAdmin({
      companyId: null,
      source: "cron_job",
      context: "operations-feed",
      message: error.message,
    })
    return Response.json({ error: error.message }, { status: 500 })
  }

  const results: (OperationsFeedRunSummary | { companyId: string; error: string })[] = []
  for (const company of companies ?? []) {
    try {
      results.push(await runOperationsFeedForCompany(supabase, company.id))
    } catch (err) {
      // One tenant's failure must never stop the rest of the run —
      // same "best-effort, isolated per unit of work" convention as
      // every other batch operation in this codebase.
      const message = err instanceof Error ? err.message : "Unknown error"
      results.push({ companyId: company.id, error: message })
      void logOperationalEventAsAdmin({
        companyId: company.id,
        source: "cron_job",
        context: "operations-feed",
        message,
      })
    }
  }

  return Response.json({ ranAt: new Date().toISOString(), companiesProcessed: results.length, results })
}
