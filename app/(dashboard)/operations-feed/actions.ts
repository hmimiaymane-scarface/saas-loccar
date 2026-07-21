"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { runOperationsFeedForCompany, type OperationsFeedRunSummary } from "@/lib/operations-feed/run"

const DISMISS_ROLES = ["owner", "manager", "agent"] as const
const RUN_NOW_ROLES = ["owner", "manager"] as const

export async function dismissFeedItemAction(itemId: string): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...DISMISS_ROLES])
    const supabase = await createClient()

    const { error } = await supabase
      .from("operations_feed_items")
      .update({ status: "dismissed", dismissed_at: new Date().toISOString(), dismissed_by: session.userId })
      .eq("id", itemId)
      .eq("company_id", session.company.id)
      .eq("status", "open")

    if (error) return { error: friendlyDbError(error) }
    revalidatePath("/operations-feed")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/**
 * Dev/manual trigger — runs the exact same `runOperationsFeedForCompany`
 * the cron route calls, scoped to the caller's own company. Uses the
 * admin client rather than the request-scoped one: `operations_feed_items`
 * has no INSERT/UPDATE-for-content policy for ordinary authenticated
 * users at all (see the migration's own comment — only the service-role
 * cron path and this action write to it), so access control here is
 * enforced by `requireRole` above, not by RLS. Lets the whole feature be
 * demoed and tested without deploying to Vercel or waiting for the
 * daily schedule.
 */
export async function runObserversNowAction(): Promise<{ error?: string; summary?: OperationsFeedRunSummary }> {
  try {
    const session = await requireSession()
    requireRole(session, [...RUN_NOW_ROLES])
    const supabase = createAdminClient()
    const summary = await runOperationsFeedForCompany(supabase, session.company.id)
    revalidatePath("/operations-feed")
    revalidatePath("/overview")
    return { summary }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    return { error: err instanceof Error ? err.message : "The observer run failed." }
  }
}
