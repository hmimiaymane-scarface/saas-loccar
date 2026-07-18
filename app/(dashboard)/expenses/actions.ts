"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString, requiredNumber, requiredEnum } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/activity-log"
import type { EmployeeRole, ExpenseCategory, PaymentMethod } from "@/types/rental"

const EXPENSE_MANAGE_ROLES = ["owner", "manager"] as const
const EXPENSE_RECORD_ROLES = ["owner", "manager", "accountant"] as const
// Editing/attaching a receipt to an *existing* expense stays limited to
// owner/manager/accountant, matching the "Finance roles can update
// expenses" RLS policy exactly (unlike creation, this was never widened
// to include agents — see 20260720090600_settings_and_rls.sql). Using a
// looser check here than RLS actually allows would let the action report
// success while the UPDATE silently affects 0 rows.
const EXPENSE_UPDATE_ROLES = EXPENSE_RECORD_ROLES

const CATEGORIES: ExpenseCategory[] = [
  "maintenance",
  "fuel",
  "cleaning",
  "insurance",
  "technical_inspection",
  "registration",
  "rent",
  "utilities",
  "marketing",
  "commission",
  "office_supplies",
  "tolls",
  "fines",
  "vehicle_purchase",
  "salary",
  "parking",
  "other",
]
const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "other"]

export interface ExpenseActionState {
  error?: string
  expenseId?: string
}

/** Coarse RLS already allows owner/manager/accountant/agent to insert an
 * expense row (see 20260720090600_settings_and_rls.sql) — whether an
 * agent's insert is actually allowed for this company is the finer check
 * done here, against companies.agents_can_record_expenses. Same
 * "coarse RLS + fine action-layer check" pattern documented in
 * docs/security.md. */
async function requireExpenseWriteAccess() {
  const session = await requireSession()
  const allowedRoles: EmployeeRole[] = [...EXPENSE_RECORD_ROLES]
  if (session.company.agentsCanRecordExpenses) allowedRoles.push("agent")
  requireRole(session, allowedRoles)
  return session
}

export async function createExpense(
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  try {
    const session = await requireExpenseWriteAccess()
    const companyId = session.company.id
    const supabase = await createClient()

    const category = requiredEnum(formData, "category", CATEGORIES, "Category")
    const amount = requiredNumber(formData, "amount", "Amount")
    if (amount <= 0) throw new ActionError("Amount must be greater than zero.")
    const expenseDate = requiredString(formData, "expenseDate", "Date")
    const method = optionalString(formData, "method")
    if (method && !METHODS.includes(method as (typeof METHODS)[number])) throw new ActionError("Invalid payment method.")
    const vehicleId = optionalString(formData, "vehicleId")
    const supplier = optionalString(formData, "supplier")
    const description = optionalString(formData, "description")
    const notes = optionalString(formData, "notes")

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        company_id: companyId,
        category,
        amount,
        expense_date: expenseDate,
        method: method || null,
        vehicle_id: vehicleId,
        supplier,
        description,
        notes,
        recorded_by: session.userId,
      })
      .select("id")
      .single()

    if (error) return { error: friendlyDbError(error) }

    await logActivity(
      supabase,
      companyId,
      session.userId,
      "expense_recorded",
      `${category.replace("_", " ")} expense recorded`,
      description,
      vehicleId ? { vehicle_id: vehicleId } : undefined
    )

    revalidatePath("/expenses")
    if (vehicleId) revalidatePath(`/fleet/${vehicleId}`)
    revalidatePath("/overview")
    return { expenseId: data.id }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function updateExpense(
  expenseId: string,
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...EXPENSE_UPDATE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const category = requiredEnum(formData, "category", CATEGORIES, "Category")
    const amount = requiredNumber(formData, "amount", "Amount")
    if (amount <= 0) throw new ActionError("Amount must be greater than zero.")
    const expenseDate = requiredString(formData, "expenseDate", "Date")
    const method = optionalString(formData, "method")
    if (method && !METHODS.includes(method as (typeof METHODS)[number])) throw new ActionError("Invalid payment method.")
    const supplier = optionalString(formData, "supplier")
    const description = optionalString(formData, "description")
    const notes = optionalString(formData, "notes")

    const { error } = await supabase
      .from("expenses")
      .update({ category, amount, expense_date: expenseDate, method: method || null, supplier, description, notes })
      .eq("id", expenseId)
      .eq("company_id", companyId)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/expenses/${expenseId}`)
    revalidatePath("/expenses")
    return { expenseId }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function deleteExpense(expenseId: string): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...EXPENSE_MANAGE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const { error } = await supabase.from("expenses").delete().eq("id", expenseId).eq("company_id", companyId)
    if (error) return { error: friendlyDbError(error) }

    revalidatePath("/expenses")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function attachExpenseReceipt(expenseId: string, storagePath: string): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...EXPENSE_UPDATE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const { error } = await supabase
      .from("expenses")
      .update({ receipt_path: storagePath })
      .eq("id", expenseId)
      .eq("company_id", companyId)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/expenses/${expenseId}`)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
