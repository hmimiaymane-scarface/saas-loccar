"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString, requiredEnum } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import type { EmployeeRole } from "@/types/rental"

const TEAM_MANAGE_ROLES = ["owner", "manager"] as const

const ROLES: EmployeeRole[] = ["owner", "manager", "agent", "accountant", "driver"]

export interface TeamActionState {
  error?: string
}

export async function inviteMember(_prevState: TeamActionState, formData: FormData): Promise<TeamActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...TEAM_MANAGE_ROLES])
    const supabase = await createClient()

    const email = requiredString(formData, "email", "Email")
    const role = requiredEnum(formData, "role", ROLES, "Role")
    const branchId = optionalString(formData, "branchId")

    const { error } = await supabase.rpc("invite_member", {
      p_company_id: session.company.id,
      p_email: email,
      p_role: role,
      p_branch_id: branchId,
    })

    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/employees")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function revokeInvitation(invitationId: string): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...TEAM_MANAGE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    // No dedicated RPC needed — this is a plain status flip a
    // manager/owner is already allowed to make; only invite/accept touch
    // membership rows, which is what actually needed the RPC layer.
    const { error } = await supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId)
      .eq("company_id", companyId)
      .eq("status", "pending")

    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/employees")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function updateMemberRoleAction(membershipId: string, role: EmployeeRole): Promise<{ error?: string }> {
  try {
    await requireSession()
    const supabase = await createClient()

    const { error } = await supabase.rpc("update_member_role", { p_membership_id: membershipId, p_role: role })
    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/employees")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function suspendMemberAction(membershipId: string): Promise<{ error?: string }> {
  try {
    await requireSession()
    const supabase = await createClient()

    const { error } = await supabase.rpc("suspend_member", { p_membership_id: membershipId })
    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/employees")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function reactivateMemberAction(membershipId: string): Promise<{ error?: string }> {
  try {
    await requireSession()
    const supabase = await createClient()

    const { error } = await supabase.rpc("reactivate_member", { p_membership_id: membershipId })
    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/employees")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function removeMemberAction(membershipId: string): Promise<{ error?: string }> {
  try {
    await requireSession()
    const supabase = await createClient()

    const { error } = await supabase.rpc("remove_member", { p_membership_id: membershipId })
    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/employees")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
