"use server"

import { revalidatePath } from "next/cache"

import { requireSession, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"

export interface OnboardingActionState {
  error?: string
  /** Roadmap phase 47 — the wizard's own step-advance signal, replacing
   * the unconditional `redirect("/overview")` this action used to end
   * with. The company now exists after a successful call (this action
   * still creates it via the same RPC as before), but staying on
   * `/onboarding` lets the client wizard move to the next step instead
   * of leaving the flow after just one screen. */
  companyCreated?: boolean
}

/**
 * Creates the caller's company via the create_company_with_owner() RPC
 * (supabase/migrations/20260718120900_onboarding_function.sql). All of the
 * "make this person an owner" logic lives in that SECURITY DEFINER
 * function — this action just collects form input and forwards it. There
 * is deliberately no direct insert into `companies` or
 * `company_memberships` here; RLS wouldn't allow one anyway.
 */
export async function createCompany(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  const currency = String(formData.get("currency") ?? "MAD")
  const language = String(formData.get("language") ?? "fr")

  if (!name) {
    return { error: "Company name is required." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("create_company_with_owner", {
    p_name: name,
    p_city: city || null,
    p_phone: phone || null,
    p_currency: currency,
    p_language: language,
  })

  if (error) {
    return { error: error.message }
  }

  return { companyCreated: true }
}

// ---------------------------------------------------------------------
// Later wizard steps (roadmap phase 47) — all operate on the
// already-created company via the caller's own session, same as any
// other authenticated action; no RPC needed since a real
// `company_memberships` row (owner) now exists for ordinary RLS to work
// against.
// ---------------------------------------------------------------------

export interface WizardStepState {
  error?: string
}

export async function updateCompanyLogo(logoPath: string): Promise<WizardStepState> {
  try {
    const session = await requireSession()
    const supabase = await createClient()
    const { error } = await supabase.from("companies").update({ logo_path: logoPath }).eq("id", session.company.id)
    if (error) return { error: friendlyDbError(error) }
    revalidatePath("/onboarding")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export interface RentalDefaultsInput {
  defaultDepositMad?: number | null
  overdueGracePeriodHours: number
}

export async function updateRentalDefaults(input: RentalDefaultsInput): Promise<WizardStepState> {
  try {
    const session = await requireSession()
    if (input.overdueGracePeriodHours < 0 || input.overdueGracePeriodHours > 168) {
      throw new ActionError("Grace period must be between 0 and 168 hours.")
    }
    if (input.defaultDepositMad != null && input.defaultDepositMad < 0) {
      throw new ActionError("Default deposit can't be negative.")
    }
    const supabase = await createClient()
    const { error } = await supabase
      .from("companies")
      .update({
        default_deposit_mad: input.defaultDepositMad ?? null,
        overdue_grace_period_hours: input.overdueGracePeriodHours,
      })
      .eq("id", session.company.id)
    if (error) return { error: friendlyDbError(error) }
    revalidatePath("/onboarding")
    revalidatePath("/overview")
    revalidatePath("/settings")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
