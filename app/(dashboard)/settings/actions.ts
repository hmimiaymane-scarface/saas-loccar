"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString, requiredNumber, optionalNumber } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import type { NotificationType } from "@/types/rental"

const SETTINGS_ROLES = ["owner", "manager"] as const

export interface SettingsActionState {
  error?: string
}

export async function updateCompanySettings(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...SETTINGS_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const maintenanceReminderDays = requiredNumber(formData, "maintenanceReminderDays", "Maintenance reminder threshold")
    if (maintenanceReminderDays <= 0) throw new ActionError("Maintenance reminder threshold must be a positive number of days.")
    const documentExpiryWarningDays = requiredNumber(formData, "documentExpiryWarningDays", "Document expiry warning threshold")
    if (documentExpiryWarningDays <= 0) throw new ActionError("Document expiry warning threshold must be a positive number of days.")
    const agentsCanRecordExpenses = formData.get("agentsCanRecordExpenses") === "on"
    const mutedTypes = formData.getAll("mutedNotificationTypes").map(String) as NotificationType[]
    const currency = requiredString(formData, "currency", "Currency")
    const email = optionalString(formData, "email")
    const address = optionalString(formData, "address")
    const defaultDepositMad = optionalNumber(formData, "defaultDepositMad")
    if (defaultDepositMad != null && defaultDepositMad < 0) {
      throw new ActionError("Default deposit can't be negative.")
    }
    const overdueGracePeriodHours = requiredNumber(formData, "overdueGracePeriodHours", "Overdue grace period")
    if (overdueGracePeriodHours < 0 || overdueGracePeriodHours > 168) {
      throw new ActionError("Overdue grace period must be between 0 and 168 hours.")
    }

    const { error } = await supabase
      .from("companies")
      .update({
        maintenance_reminder_days: maintenanceReminderDays,
        document_expiry_warning_days: documentExpiryWarningDays,
        agents_can_record_expenses: agentsCanRecordExpenses,
        muted_notification_types: mutedTypes,
        currency,
        email,
        address,
        default_deposit_mad: defaultDepositMad,
        overdue_grace_period_hours: overdueGracePeriodHours,
      })
      .eq("id", companyId)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/settings")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Branch create/update is owner or manager (see docs/security.md's
 * per-table access table); only *deleting* a branch is owner-only,
 * enforced by RLS itself rather than duplicated here. */
export async function createBranch(_prevState: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...SETTINGS_ROLES])
    const supabase = await createClient()

    const name = requiredString(formData, "name", "Branch name")
    const city = optionalString(formData, "city")
    const phone = optionalString(formData, "phone")
    const address = optionalString(formData, "address")

    const { error } = await supabase.from("branches").insert({
      company_id: session.company.id,
      name,
      city,
      phone,
      address,
    })

    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/settings")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function updateBranch(branchId: string, _prevState: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...SETTINGS_ROLES])
    const supabase = await createClient()

    const name = requiredString(formData, "name", "Branch name")
    const city = optionalString(formData, "city")
    const phone = optionalString(formData, "phone")
    const address = optionalString(formData, "address")

    const { error } = await supabase
      .from("branches")
      .update({ name, city, phone, address })
      .eq("id", branchId)
      .eq("company_id", session.company.id)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/settings")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
