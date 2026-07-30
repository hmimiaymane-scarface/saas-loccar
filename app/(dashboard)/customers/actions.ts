"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import { findDuplicateCandidates } from "@/lib/data"
import { recordEvent } from "@/lib/activity-log"
import { validateFile, ACCEPTED_SCAN_MIME_TYPES } from "@/lib/storage"
import { classifyAndExtractBytes, type ExtractedFields } from "@/lib/document-extraction"
import type { DuplicateMatch } from "@/lib/customer-matching"
import type { ActivityType, DocumentCategory } from "@/types/rental"

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

export interface OnboardingExtractionResult {
  /** Set on a hard failure — bad file, no provider configured. */
  error?: string
  category?: DocumentCategory
  classificationConfidence?: number
  /** Populated fields for a supported, extractable category. Explicitly
   * null (not just absent) for a recognized category with no extraction
   * schema (e.g. a proof-of-address scanned by mistake) — distinct from
   * `extractionMessage`, which means extraction was attempted and failed
   * (a blurry photo, a provider error) rather than never attempted. */
  fields?: ExtractedFields | null
  extractionMessage?: string
}

/** Roadmap phase 14 — runs classification+extraction against a freshly
 * captured photo before any customer record exists yet (see
 * lib/document-extraction.ts's "Bytes-based variants" section for why).
 * Auth-gated the same as every other document-intelligence caller, even
 * though nothing here is company-scoped data — this exists purely to
 * keep the AI provider call behind a signed-in staff session. */
export async function extractOnboardingDocument(formData: FormData): Promise<OnboardingExtractionResult> {
  try {
    const session = await requireSession()
    requireRole(session, [...CUSTOMER_ROLES])

    const file = formData.get("file")
    if (!(file instanceof File)) throw new ActionError("No file provided.")

    const validationError = validateFile(file, ACCEPTED_SCAN_MIME_TYPES)
    if (validationError) throw new ActionError(validationError)

    const fileBytes = Buffer.from(await file.arrayBuffer())
    const result = await classifyAndExtractBytes(fileBytes, file.type)

    if (!result.ok) return { error: result.message }
    if (!result.extraction) {
      return { category: result.category, classificationConfidence: result.classificationConfidence, fields: null }
    }
    if (!result.extraction.ok) {
      return {
        category: result.category,
        classificationConfidence: result.classificationConfidence,
        extractionMessage: result.extraction.message,
      }
    }
    return {
      category: result.category,
      classificationConfidence: result.classificationConfidence,
      fields: result.extraction.fields,
    }
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
  status: (typeof STATUSES)[number],
  reason?: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...CUSTOMER_STATUS_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (!STATUSES.includes(status)) throw new ActionError("Invalid status.")
    // Blacklisting a customer (blocking them) is a sensitive operation —
    // a reason must be on record, same as activate_rental()'s
    // p_override_reason precedent. Un-blocking and flagging aren't
    // gated the same way; they're reversible, lower-stakes calls.
    if (status === "blocked" && !reason?.trim()) {
      throw new ActionError("A reason is required to block a customer.")
    }

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
      description: reason?.trim() || null,
      metadata: { before: { status: existing.status }, after: { status }, reason: reason?.trim() || null },
    })

    revalidatePath(`/customers/${customerId}`)
    revalidatePath("/customers")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

// ---------------------------------------------------------------------
// Communication log (roadmap phase 46) — "what have we already done
// with this customer?"
// ---------------------------------------------------------------------

type CommunicationLogType =
  | "whatsapp_confirmation_sent"
  | "whatsapp_pickup_reminder_sent"
  | "whatsapp_return_reminder_sent"
  | "whatsapp_payment_reminder_sent"
  | "whatsapp_contract_sent"
  | "call_logged"

export interface LogCommunicationInput {
  type: CommunicationLogType
  customerId: string
  reservationId?: string
  title: string
  description?: string
}

/**
 * Fired from `WhatsAppButton`/`CallButton`'s `onClick` the instant staff
 * clicks — the only moment this app can actually observe (see
 * `ACTIVITY_TYPES`' own comment in `types/rental.ts`: this app has no
 * visibility into whether the WhatsApp draft was actually sent, or a
 * dialed call answered). `entityType: "customer"` so it satisfies
 * `getCustomerTimeline`'s first OR-clause directly, regardless of
 * whether a `reservationId` is available — `metadata.reservation_id`
 * is included when it is, for a future reservation-level timeline to
 * pick up too, not because the customer timeline itself requires it.
 *
 * Best-effort by design, same convention as `logContractViewedAction`:
 * a failed log write must never surface as an error to someone who
 * just opened WhatsApp or dialed a number — the primary action already
 * happened outside this app's control by the time this fires.
 */
export async function logCommunicationAction(input: LogCommunicationInput): Promise<void> {
  try {
    const session = await requireSession()
    const supabase = await createClient()
    await recordEvent(supabase, {
      companyId: session.company.id,
      actorId: session.userId,
      type: input.type as ActivityType,
      entityType: "customer",
      entityId: input.customerId,
      title: input.title,
      description: input.description,
      metadata: input.reservationId
        ? { reservation_id: input.reservationId, customer_id: input.customerId }
        : { customer_id: input.customerId },
    })
    revalidatePath(`/customers/${input.customerId}`)
  } catch {
    // Best-effort — see doc comment above.
  }
}
