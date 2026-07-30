"use server"

import { revalidatePath } from "next/cache"

import { requireSession, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"

export interface PasskeyItem {
  id: string
  deviceLabel: string | null
  createdAt: string
  lastUsedAt: string | null
}

/** A user manages only their own passkeys — no role check beyond
 * "signed in," matching this being a personal security setting rather
 * than a company one (RLS on webauthn_credentials already enforces
 * user_id = auth.uid() regardless, this is the same check surfaced as
 * a friendly early return). */
export async function listPasskeys(): Promise<PasskeyItem[]> {
  const session = await requireSession()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("webauthn_credentials")
    .select("id, device_label, created_at, last_used_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    deviceLabel: row.device_label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }))
}

export async function removePasskey(credentialId: string): Promise<{ error?: string }> {
  const session = await requireSession()
  const supabase = await createClient()
  const { error } = await supabase
    .from("webauthn_credentials")
    .delete()
    .eq("id", credentialId)
    .eq("user_id", session.userId)
  if (error) return { error: friendlyDbError(error) }
  revalidatePath("/profile")
  return {}
}

// ---------------------------------------------------------------------
// Push notifications (roadmap phase 44) — same "personal setting, no
// role check beyond signed-in" shape as passkeys above.
// ---------------------------------------------------------------------

export interface PushSubscriptionInput {
  endpoint: string
  p256dhKey: string
  authKey: string
  userAgent?: string
}

export interface PushSubscriptionItem {
  id: string
  endpoint: string
  userAgent: string | null
  createdAt: string
}

export async function listPushSubscriptions(): Promise<PushSubscriptionItem[]> {
  const session = await requireSession()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, user_agent, created_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    endpoint: row.endpoint,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }))
}

/** `endpoint` is globally unique (the Web Push spec guarantees one per
 * browser/device registration) — upserting on it means re-subscribing
 * the same device (e.g. after clearing site data) replaces its old
 * keys rather than erroring or duplicating. */
export async function subscribeToPush(input: PushSubscriptionInput): Promise<{ error?: string }> {
  const session = await requireSession()
  const supabase = await createClient()
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      company_id: session.company.id,
      user_id: session.userId,
      endpoint: input.endpoint,
      p256dh_key: input.p256dhKey,
      auth_key: input.authKey,
      user_agent: input.userAgent ?? null,
    },
    { onConflict: "endpoint" }
  )
  if (error) return { error: friendlyDbError(error) }
  revalidatePath("/profile")
  return {}
}

export async function unsubscribeFromPush(endpoint: string): Promise<{ error?: string }> {
  const session = await requireSession()
  const supabase = await createClient()
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", session.userId)
  if (error) return { error: friendlyDbError(error) }
  revalidatePath("/profile")
  return {}
}
