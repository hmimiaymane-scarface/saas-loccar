"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"

const CUSTOMER_ROLES = ["owner", "manager", "agent"] as const
const CUSTOMER_STATUS_ROLES = ["owner", "manager"] as const
const STATUSES = ["active", "flagged", "blocked"] as const

export interface CustomerActionState {
  error?: string
}

export async function updateCustomerProfile(
  customerId: string,
  _prevState: CustomerActionState,
  formData: FormData
): Promise<CustomerActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...CUSTOMER_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const fullName = requiredString(formData, "fullName", "Full name")
    const phone = requiredString(formData, "phone", "Phone")
    const email = optionalString(formData, "email")
    const nationality = optionalString(formData, "nationality")
    const idDocumentNumber = optionalString(formData, "idDocumentNumber")
    const licenseNumber = optionalString(formData, "licenseNumber")
    const licenseExpiresOn = optionalString(formData, "licenseExpiresOn")
    const address = optionalString(formData, "address")
    const notes = optionalString(formData, "notes")

    const { error } = await supabase
      .from("customers")
      .update({
        full_name: fullName,
        phone,
        email,
        nationality,
        id_document_number: idDocumentNumber,
        license_number: licenseNumber,
        license_expires_on: licenseExpiresOn,
        address,
        notes,
      })
      .eq("id", customerId)
      .eq("company_id", companyId)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/customers/${customerId}`)
    revalidatePath("/customers")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Flagging/blocking a customer affects whether staff can book them again —
 * an owner/manager decision, not something an agent should be able to do
 * unilaterally mid-dispute. */
export async function setCustomerStatus(
  customerId: string,
  status: (typeof STATUSES)[number]
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...CUSTOMER_STATUS_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (!STATUSES.includes(status)) throw new ActionError("Invalid status.")

    const { error } = await supabase
      .from("customers")
      .update({ status })
      .eq("id", customerId)
      .eq("company_id", companyId)

    if (error) return { error: friendlyDbError(error) }

    revalidatePath(`/customers/${customerId}`)
    revalidatePath("/customers")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
