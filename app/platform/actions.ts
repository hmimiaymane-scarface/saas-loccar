"use server"

import { revalidatePath } from "next/cache"

import { requirePlatformAdminAction } from "@/lib/auth/platform"
import { ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"
import type { SubscriptionStatus } from "@/types/platform"

/** Every action here re-checks platform-admin status itself (via
 * requirePlatformAdminAction, which calls the same is_platform_admin()
 * RPC the database functions check again internally) — belt and braces,
 * matching the rest of this codebase's action-layer + RLS/RPC pattern. */

function revalidateCompany(companyId: string) {
  revalidatePath("/platform")
  revalidatePath("/platform/companies")
  revalidatePath(`/platform/companies/${companyId}`)
}

export async function startOrExtendTrial(
  companyId: string,
  trialEndsOn: string,
  trialStartsOn?: string
): Promise<{ error?: string }> {
  try {
    await requirePlatformAdminAction()
    const supabase = await createClient()
    const { error } = await supabase.rpc("platform_start_or_extend_trial", {
      p_company_id: companyId,
      p_trial_ends_on: trialEndsOn,
      p_trial_starts_on: trialStartsOn || null,
    })
    if (error) return { error: friendlyDbError(error) }
    revalidateCompany(companyId)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function setSubscriptionStatus(
  companyId: string,
  status: SubscriptionStatus,
  reason?: string
): Promise<{ error?: string }> {
  try {
    await requirePlatformAdminAction()
    const supabase = await createClient()
    const { error } = await supabase.rpc("platform_set_subscription_status", {
      p_company_id: companyId,
      p_status: status,
      p_reason: reason || null,
    })
    if (error) return { error: friendlyDbError(error) }
    revalidateCompany(companyId)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function updateSubscriptionDates(
  companyId: string,
  subscriptionStartsOn: string | null,
  subscriptionEndsOn: string | null
): Promise<{ error?: string }> {
  try {
    await requirePlatformAdminAction()
    const supabase = await createClient()
    const { error } = await supabase.rpc("platform_update_subscription_dates", {
      p_company_id: companyId,
      p_subscription_starts_on: subscriptionStartsOn,
      p_subscription_ends_on: subscriptionEndsOn,
    })
    if (error) return { error: friendlyDbError(error) }
    revalidateCompany(companyId)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function updatePlan(
  companyId: string,
  planLabel: string,
  monthlyPriceMad: number | null,
  currency = "MAD"
): Promise<{ error?: string }> {
  try {
    await requirePlatformAdminAction()
    if (!planLabel.trim()) throw new ActionError("Plan label is required.")
    const supabase = await createClient()
    const { error } = await supabase.rpc("platform_update_plan", {
      p_company_id: companyId,
      p_plan_label: planLabel.trim(),
      p_monthly_price_mad: monthlyPriceMad,
      p_currency: currency,
    })
    if (error) return { error: friendlyDbError(error) }
    revalidateCompany(companyId)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function updateNotes(companyId: string, notes: string): Promise<{ error?: string }> {
  try {
    await requirePlatformAdminAction()
    const supabase = await createClient()
    const { error } = await supabase.rpc("platform_update_notes", {
      p_company_id: companyId,
      p_notes: notes.trim() || null,
    })
    if (error) return { error: friendlyDbError(error) }
    revalidateCompany(companyId)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
