"use server"

import { redirect } from "next/navigation"

import { requireSession, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { createClient } from "@/lib/supabase/server"

export async function acceptInvitationAction(token: string): Promise<{ error?: string }> {
  try {
    await requireSession()
    const supabase = await createClient()

    const { error } = await supabase.rpc("accept_invitation", { p_token: token })
    if (error) return { error: friendlyDbError(error) }

    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function acceptInvitationAndRedirect(token: string) {
  const result = await acceptInvitationAction(token)
  if (!result.error) redirect("/overview")
  return result
}
