"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import { findDuplicateCandidates } from "@/lib/data"
import { recordEvent } from "@/lib/activity-log"
import type { DuplicateMatch } from "@/lib/customer-matching"

const CUSTOMER_ROLES = ["owner", "manager", "agent"] as const
const CUSTOMER_STATUS_ROLES = ["owner", "manager"] as const
const STATUSES = ["active", "flagged", "blocked"] as const

export interface CustomerActionState {
  error?: string
  customerId?: string
  /** Duplicate candidates (roadmap phase 04 requirement 5, extended by
   * phase 08 requirement 3 to also match on phone/email/birth date) —
   * never blocks create/edit outright. Resubmitting with
   * acknowledgeDuplicates=true skips this check and saves anyway (the
   * bible's "Keep Separate" choice); "Use them" on a candidate is
   * "Merge" in spirit (navigate to the existing record instead).
   * "Review Later" is simply not acknowledging yet — the candidates
   * stay visible until the user picks one of the other two. */
  duplicateCandidates?: DuplicateMatch[]
}

/** Standalone customer creation (the guided /customers/new form). The
 * quick "new customer" path inside reservation creation stays a separate,
 * minimal insert in reservations/actions.ts on purpose — it only ever
 * needs name + phone, and shouldn't gain this form's extra required
 * fields; it isn't duplicate-checked by this same flow. */
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
    const dateOfBirth = optionalString(formData, "dateOfBirth")
    const address = optionalString(formData, "address")
    const notes = optionalString(formData, "notes")
    const marketingConsent = formData.get("marketingConsent") === "true"

    const acknowledgeDuplicates = formData.get("acknowledgeDuplicates") === "true"
    if (!acknowledgeDuplicates) {
      const candidates = await findDuplicateCandidates(companyId, { fullName, idDocumentNumber, licenseNumber, phone, email, dateOfBirth })
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
        date_of_birth: dateOfBirth,
        address,
        notes,
        marketing_consent: marketingConsent,
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
    const dateOfBirth = optionalString(formData, "dateOfBirth")
    const address = optionalString(formData, "address")
    const notes = optionalString(formData, "notes")
    const marketingConsent = formData.get("marketingConsent") === "true"

    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("full_name, phone, email, nationality, id_document_number, license_number, license_expires_on, date_of_birth, address, notes, marketing_consent")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (fetchError) throw new ActionError(friendlyDbError(fetchError))
    if (!existing) throw new ActionError("Customer not found.")

    // Same duplicate check as createCustomer (phase 08 requirement 3:
    // "creating or editing a customer") — excludes this customer's own
    // record so editing your own profile never flags itself.
    const acknowledgeDuplicates = formData.get("acknowledgeDuplicates") === "true"
    if (!acknowledgeDuplicates) {
      const candidates = await findDuplicateCandidates(
        companyId,
        { fullName, idDocumentNumber, licenseNumber, phone, email, dateOfBirth },
        customerId
      )
      const likely = candidates.filter((c) => c.isLikelyDuplicate)
      if (likely.length > 0) {
        return { duplicateCandidates: likely }
      }
    }

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
        date_of_birth: dateOfBirth,
        address,
        notes,
        marketing_consent: marketingConsent,
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
          date_of_birth: dateOfBirth,
          address,
          notes,
          marketing_consent: marketingConsent,
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
