"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import { findCustomerByPhone, findDuplicateCandidates } from "@/lib/data"
import { recordEvent } from "@/lib/activity-log"
import type { DuplicateMatch } from "@/lib/customer-matching"

const CUSTOMER_ROLES = ["owner", "manager", "agent"] as const
const CUSTOMER_STATUS_ROLES = ["owner", "manager"] as const
const STATUSES = ["active", "flagged", "blocked"] as const

export interface CustomerActionState {
  error?: string
  customerId?: string
  duplicateCustomer?: { id: string; fullName: string; phone: string }
  /** Identity-based near-matches (roadmap phase 04 requirement 5) — a
   * softer signal than duplicateCustomer's exact phone match. The form
   * shows these but doesn't block creation; resubmitting with
   * acknowledgeDuplicates=true skips this check and creates anyway
   * (the bible's "Keep Separate" choice). */
  duplicateCandidates?: DuplicateMatch[]
}

/** Standalone customer creation (the guided /customers/new form). The
 * quick "new customer" path inside reservation creation stays a separate,
 * minimal insert in reservations/actions.ts on purpose — it only ever
 * needs name + phone, and shouldn't gain this form's extra required
 * fields. Same duplicate-by-phone check as that path, so a customer can't
 * be created twice by two different routes into this app. */
export async function createCustomer(
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

    const existing = await findCustomerByPhone(companyId, phone)
    if (existing) {
      return {
        error: "A customer with this phone number already exists.",
        duplicateCustomer: { id: existing.id, fullName: existing.fullName, phone: existing.phone },
      }
    }

    const acknowledgeDuplicates = formData.get("acknowledgeDuplicates") === "true"
    if (!acknowledgeDuplicates) {
      const candidates = await findDuplicateCandidates(companyId, { fullName, idDocumentNumber, licenseNumber })
      const likely = candidates.filter((c) => c.isLikelyDuplicate)
      if (likely.length > 0) {
        return { duplicateCandidates: likely }
      }
    }

    const { data, error } = await supabase
      .from("customers")
      .insert({
        company_id: companyId,
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
      .select("id")
      .single()

    if (error) return { error: friendlyDbError(error) }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "customer_created",
      entityType: "customer",
      entityId: data.id as string,
      title: "Customer added",
    })

    revalidatePath("/customers")
    return { customerId: data.id as string }
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
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

    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("full_name, phone, email, nationality, id_document_number, license_number, license_expires_on, address, notes")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (fetchError) throw new ActionError(friendlyDbError(fetchError))
    if (!existing) throw new ActionError("Customer not found.")

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

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "customer_updated",
      entityType: "customer",
      entityId: customerId,
      title: "Customer profile updated",
      metadata: {
        before: existing,
        after: {
          full_name: fullName,
          phone,
          email,
          nationality,
          id_document_number: idDocumentNumber,
          license_number: licenseNumber,
          license_expires_on: licenseExpiresOn,
          address,
          notes,
        },
      },
    })

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

    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("status")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (fetchError) return { error: friendlyDbError(fetchError) }
    if (!existing) throw new ActionError("Customer not found.")

    const { error } = await supabase
      .from("customers")
      .update({ status })
      .eq("id", customerId)
      .eq("company_id", companyId)

    if (error) return { error: friendlyDbError(error) }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "customer_updated",
      entityType: "customer",
      entityId: customerId,
      title: `Customer marked ${status}`,
      metadata: { before: { status: existing.status }, after: { status } },
    })

    revalidatePath(`/customers/${customerId}`)
    revalidatePath("/customers")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
