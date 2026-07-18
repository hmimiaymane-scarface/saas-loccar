"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export interface OnboardingActionState {
  error?: string
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

  redirect("/overview")
}
