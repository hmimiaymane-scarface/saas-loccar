"use server"

import { revalidatePath } from "next/cache"

import { requireSession, requireRole, ActionError, friendlyDbError } from "@/lib/auth/guard"
import { requiredString, optionalString, requiredNumber, requiredEnum } from "@/lib/form-input"
import { createClient } from "@/lib/supabase/server"
import { recordEvent } from "@/lib/activity-log"
import { computeDepositStatus, exceedsCollected } from "@/lib/deposits"
import { recomputeCustomerIntelligenceBestEffort } from "@/lib/customer-intelligence-store"
import type { PaymentMethod, PaymentTransactionType } from "@/types/rental"

const PAYMENT_ROLES = ["owner", "manager", "agent", "accountant"] as const
const DEPOSIT_RESOLVE_ROLES = ["owner", "manager"] as const

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "other"]
const GENERAL_TRANSACTION_TYPES: PaymentTransactionType[] = [
  "rental_payment",
  "damage_charge",
  "additional_charge",
  "refund",
]

export interface PaymentActionState {
  error?: string
}

/**
 * Records a general financial transaction (rental payment, damage charge,
 * additional charge, or refund). Deposit collection/return go through the
 * dedicated deposit actions below instead, because those also need to
 * keep the `deposits` row's running totals in sync — a plain payment
 * insert alone doesn't know how to do that.
 */
export async function recordPayment(
  _prevState: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  try {
    const session = await requireSession()
    requireRole(session, [...PAYMENT_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    const customerId = requiredString(formData, "customerId", "Customer")
    const reservationId = optionalString(formData, "reservationId")
    const transactionType = requiredEnum(formData, "transactionType", GENERAL_TRANSACTION_TYPES, "Type")
    const amount = requiredNumber(formData, "amount", "Amount")
    if (amount <= 0) throw new ActionError("Amount must be greater than zero.")
    const method = requiredEnum(formData, "method", METHODS, "Method")
    const reference = optionalString(formData, "reference")
    const notes = optionalString(formData, "notes")

    const { error } = await supabase.from("payments").insert({
      company_id: companyId,
      reservation_id: reservationId,
      customer_id: customerId,
      transaction_type: transactionType,
      amount,
      method,
      reference,
      notes,
      recorded_by: session.userId,
    })

    if (error) return { error: friendlyDbError(error) }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: transactionType === "refund" ? "payment_refunded" : "payment_recorded",
      entityType: reservationId ? "reservation" : "customer",
      entityId: reservationId ?? customerId,
      title: `${transactionType.replace("_", " ")} recorded`,
      description: reference ? `Ref. ${reference}` : null,
      metadata: reservationId ? { reservation_id: reservationId, customer_id: customerId } : { customer_id: customerId },
    })

    // Roadmap phase 08 requirement 6 — see the matching call in
    // reservations/actions.ts#completeRentalAction.
    await recomputeCustomerIntelligenceBestEffort(supabase, session, customerId, "payment_recorded")

    if (reservationId) revalidatePath(`/reservations/${reservationId}`)
    revalidatePath("/payments")
    revalidatePath("/overview")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

async function getOrCreateDeposit(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  companyId: string,
  reservationId: string
) {
  const { data: existing } = await supabase
    .from("deposits")
    .select("*")
    .eq("company_id", companyId)
    .eq("reservation_id", reservationId)
    .maybeSingle()

  if (existing) return existing

  const { data: created, error } = await supabase
    .from("deposits")
    .insert({ company_id: companyId, reservation_id: reservationId })
    .select("*")
    .single()

  if (error) throw new ActionError(friendlyDbError(error))
  return created
}

export async function setExpectedDeposit(
  reservationId: string,
  expectedAmount: number
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...PAYMENT_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (expectedAmount < 0) throw new ActionError("Expected deposit can't be negative.")

    const deposit = await getOrCreateDeposit(supabase, companyId, reservationId)
    const status = computeDepositStatus(
      expectedAmount,
      Number(deposit.collected_amount),
      Number(deposit.returned_amount),
      Number(deposit.retained_amount)
    )

    const { error } = await supabase
      .from("deposits")
      .update({ expected_amount: expectedAmount, status })
      .eq("id", deposit.id)

    if (error) return { error: friendlyDbError(error) }
    revalidatePath(`/reservations/${reservationId}`)
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

export async function collectDeposit(
  reservationId: string,
  amount: number,
  method: PaymentMethod
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...PAYMENT_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (amount <= 0) throw new ActionError("Amount must be greater than zero.")

    const { data: reservation } = await supabase
      .from("reservations")
      .select("customer_id")
      .eq("id", reservationId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (!reservation) throw new ActionError("Reservation not found.")

    const deposit = await getOrCreateDeposit(supabase, companyId, reservationId)
    const collected = Number(deposit.collected_amount) + amount
    const status = computeDepositStatus(Number(deposit.expected_amount), collected, Number(deposit.returned_amount), Number(deposit.retained_amount))

    const { error: depositError } = await supabase
      .from("deposits")
      .update({
        collected_amount: collected,
        status,
        method,
        collected_at: deposit.collected_at ?? new Date().toISOString(),
      })
      .eq("id", deposit.id)

    if (depositError) return { error: friendlyDbError(depositError) }

    const { error: paymentError } = await supabase.from("payments").insert({
      company_id: companyId,
      reservation_id: reservationId,
      customer_id: reservation.customer_id,
      transaction_type: "deposit_collection",
      amount,
      method,
      recorded_by: session.userId,
    })
    if (paymentError) return { error: friendlyDbError(paymentError) }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "deposit_collected",
      entityType: "reservation",
      entityId: reservationId,
      title: "Deposit collected",
      metadata: { reservation_id: reservationId },
    })

    revalidatePath(`/reservations/${reservationId}`)
    revalidatePath("/payments")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Returning and retaining a deposit are owner/manager decisions — an
 * agent can collect a deposit at pickup, but resolving it at return
 * (how much comes back, how much is kept) needs sign-off. */
export async function returnDeposit(
  reservationId: string,
  amount: number,
  method: PaymentMethod,
  notes?: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...DEPOSIT_RESOLVE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (amount <= 0) throw new ActionError("Amount must be greater than zero.")

    const { data: reservation } = await supabase
      .from("reservations")
      .select("customer_id")
      .eq("id", reservationId)
      .eq("company_id", companyId)
      .maybeSingle()
    if (!reservation) throw new ActionError("Reservation not found.")

    const deposit = await getOrCreateDeposit(supabase, companyId, reservationId)
    const returned = Number(deposit.returned_amount) + amount
    if (exceedsCollected(Number(deposit.collected_amount), returned, Number(deposit.retained_amount))) {
      throw new ActionError("Returned plus retained can't exceed the amount collected.")
    }
    const status = computeDepositStatus(Number(deposit.expected_amount), Number(deposit.collected_amount), returned, Number(deposit.retained_amount))

    const { error: depositError } = await supabase
      .from("deposits")
      .update({ returned_amount: returned, status, notes: notes ?? deposit.notes, returned_at: new Date().toISOString() })
      .eq("id", deposit.id)

    if (depositError) return { error: friendlyDbError(depositError) }

    const { error: paymentError } = await supabase.from("payments").insert({
      company_id: companyId,
      reservation_id: reservationId,
      customer_id: reservation.customer_id,
      transaction_type: "deposit_return",
      amount,
      method,
      notes,
      recorded_by: session.userId,
    })
    if (paymentError) return { error: friendlyDbError(paymentError) }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "deposit_returned",
      entityType: "reservation",
      entityId: reservationId,
      title: "Deposit returned",
      description: notes ?? null,
      metadata: { reservation_id: reservationId },
    })

    revalidatePath(`/reservations/${reservationId}`)
    revalidatePath("/payments")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}

/** Retaining part of a deposit isn't an external payment — the money was
 * already collected, this just records the decision to keep some of it
 * (typically linked to a damage charge). No `payments` row is created. */
export async function retainDeposit(
  reservationId: string,
  amount: number,
  notes: string
): Promise<{ error?: string }> {
  try {
    const session = await requireSession()
    requireRole(session, [...DEPOSIT_RESOLVE_ROLES])
    const companyId = session.company.id
    const supabase = await createClient()

    if (amount <= 0) throw new ActionError("Amount must be greater than zero.")
    if (!notes.trim()) throw new ActionError("Explain why this amount is being retained.")

    const deposit = await getOrCreateDeposit(supabase, companyId, reservationId)
    const retained = Number(deposit.retained_amount) + amount
    if (exceedsCollected(Number(deposit.collected_amount), Number(deposit.returned_amount), retained)) {
      throw new ActionError("Returned plus retained can't exceed the amount collected.")
    }
    const status = computeDepositStatus(Number(deposit.expected_amount), Number(deposit.collected_amount), Number(deposit.returned_amount), retained)

    const { error } = await supabase
      .from("deposits")
      .update({ retained_amount: retained, status, notes })
      .eq("id", deposit.id)

    if (error) return { error: friendlyDbError(error) }

    await recordEvent(supabase, {
      companyId,
      actorId: session.userId,
      type: "deposit_retained",
      entityType: "reservation",
      entityId: reservationId,
      title: "Deposit partially retained",
      description: notes,
      metadata: { reservation_id: reservationId },
    })

    revalidatePath(`/reservations/${reservationId}`)
    revalidatePath("/payments")
    return {}
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    throw err
  }
}
