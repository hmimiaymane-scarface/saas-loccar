import { tool } from "ai"
import { z } from "zod"

import type { SessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import {
  searchCustomers,
  findCustomerByPhone,
  getAvailableVehicles,
  getReservationsList,
  getOverviewMetrics,
  getTodayTimeline,
  getLiveAlerts,
  getCustomerDetail,
} from "@/lib/data"
import { calculatePricing } from "@/lib/pricing"
import type { ProposedActionType } from "@/types/ai"

const MAINTENANCE_TYPES = [
  "oil_change", "tire", "brake", "battery", "engine", "transmission", "air_conditioning",
  "bodywork", "cleaning", "inspection", "insurance_renewal", "registration_renewal",
  "routine_service", "repair", "other",
] as const

/** Every write tool ends the same way: validate just enough to write a
 * useful summary, then insert a pending proposal instead of touching any
 * operational table. Nothing here can fail in a way that changes data —
 * the worst a bad AI call can do is create a proposal a human then
 * rejects or never confirms. */
async function createProposal(
  session: SessionContext,
  conversationId: string,
  actionType: ProposedActionType,
  summary: string,
  payload: Record<string, unknown>
): Promise<{ proposalId: string; summary: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ai_proposed_actions")
    .insert({
      company_id: session.company.id,
      conversation_id: conversationId,
      action_type: actionType,
      summary,
      payload,
      status: "pending",
    })
    .select("id")
    .single()

  if (error) throw new Error(`Could not prepare that proposal: ${error.message}`)
  return { proposalId: data.id as string, summary }
}

/** Builds the full tool set for one chat turn, closed over the current
 * session (so every tool is automatically scoped to this company via
 * the same session-bound Supabase client + RLS every other page and
 * action already uses — a tool can never see or touch another
 * company's data) and the active conversation (so proposals land in the
 * right thread). */
export function buildTools(session: SessionContext, conversationId: string) {
  const companyId = session.company.id

  return {
    search_customers: tool({
      description: "Search existing customers by name or phone. Use this before proposing a reservation for someone who might already be a customer.",
      inputSchema: z.object({ query: z.string().describe("Name or phone number fragment") }),
      execute: async ({ query }) => {
        const results = await searchCustomers(companyId, query)
        return results.map((c) => ({ id: c.id, fullName: c.fullName, phone: c.phone }))
      },
    }),

    check_customer_by_phone: tool({
      description: "Check whether a phone number already belongs to an existing customer, before creating a new one.",
      inputSchema: z.object({ phone: z.string() }),
      execute: async ({ phone }) => {
        const customer = await findCustomerByPhone(companyId, phone)
        return customer ? { id: customer.id, fullName: customer.fullName, phone: customer.phone } : null
      },
    }),

    check_vehicle_availability: tool({
      description:
        "Find vehicles available for a date range. Dates must be full ISO 8601 UTC timestamps (e.g. 2026-07-25T09:00:00.000Z) — convert from the user's local time using the company's timezone given in the system prompt.",
      inputSchema: z.object({
        pickupAtIso: z.string().describe("Pickup time, ISO 8601 UTC"),
        returnAtIso: z.string().describe("Return time, ISO 8601 UTC"),
        category: z.enum(["economy", "compact", "suv", "van", "luxury"]).optional(),
      }),
      execute: async ({ pickupAtIso, returnAtIso, category }) => {
        const vehicles = await getAvailableVehicles(companyId, { pickupAt: pickupAtIso, returnAt: returnAtIso, category })
        return vehicles.map((v) => ({
          id: v.id,
          make: v.make,
          model: v.model,
          plate: v.plate,
          category: v.category,
          dailyRateMad: v.dailyRateMad,
        }))
      },
    }),

    find_reservation: tool({
      description: "Look up reservations by reference, customer name, or phone.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const result = await getReservationsList(companyId, { search: query }, 1, 5)
        return result.items.map((b) => ({
          id: b.id,
          reference: b.reference,
          customerName: b.customer.fullName,
          vehicle: b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : "Unassigned",
          startDate: b.startDate,
          endDate: b.endDate,
          status: b.status,
          totalMad: b.payment.totalDueMad,
          remainingMad: b.payment.remainingMad,
        }))
      },
    }),

    get_customer_history: tool({
      description: "Get a customer's rental history and current standing (outstanding balance, active rental).",
      inputSchema: z.object({ customerId: z.string() }),
      execute: async ({ customerId }) => {
        const detail = await getCustomerDetail(companyId, customerId)
        if (!detail) return { error: "Customer not found" }
        return {
          fullName: detail.fullName,
          phone: detail.phone,
          totalBookings: detail.reservations.length,
          outstandingBalanceMad: detail.outstandingBalanceMad,
          hasActiveRental: Boolean(detail.activeRental),
        }
      },
    }),

    get_today_snapshot: tool({
      description: "Get today's pickups, returns, revenue, and outstanding balance — for questions like 'what's happening today' or 'how are we doing this month'.",
      inputSchema: z.object({}),
      execute: async () => {
        const [metrics, timeline] = await Promise.all([getOverviewMetrics(companyId), getTodayTimeline(companyId)])
        return {
          revenueTodayMad: metrics.revenueTodayMad,
          revenueThisMonthMad: metrics.revenueThisMonthMad,
          outstandingBalanceMad: metrics.outstandingBalanceMad,
          fleet: { total: metrics.fleetTotal, available: metrics.fleetAvailable, rented: metrics.fleetRented },
          todaySchedule: timeline.map((t) => ({ type: t.type, time: t.atIso, customer: t.customerName, vehicle: t.vehicleLabel, done: t.done })),
        }
      },
    }),

    get_needs_attention: tool({
      description: "Get the list of things currently needing attention (overdue rentals, unpaid balances, maintenance due, expiring documents, etc.).",
      inputSchema: z.object({}),
      execute: async () => {
        const alerts = await getLiveAlerts(companyId, {
          maintenanceReminderDays: session.company.maintenanceReminderDays,
          documentExpiryWarningDays: session.company.documentExpiryWarningDays,
        })
        return alerts.map((a) => ({ title: a.title, description: a.description, urgency: a.urgency }))
      },
    }),

    propose_create_reservation: tool({
      description:
        "Prepare a new reservation for human confirmation. Use search_customers/check_customer_by_phone first to find an existing customer, or provide quickCustomerName+quickCustomerPhone for a new one. Use check_vehicle_availability first to get a real vehicleId and its dailyRateMad. pickupAtLocal/returnAtLocal must be the company's local wall-clock time as 'YYYY-MM-DDTHH:mm' (no timezone suffix), not UTC.",
      inputSchema: z.object({
        customerId: z.string().optional(),
        quickCustomerName: z.string().optional(),
        quickCustomerPhone: z.string().optional(),
        vehicleId: z.string().optional(),
        requestedCategory: z.enum(["economy", "compact", "suv", "van", "luxury"]).optional(),
        pickupAtLocal: z.string().describe("YYYY-MM-DDTHH:mm in company local time"),
        returnAtLocal: z.string().describe("YYYY-MM-DDTHH:mm in company local time"),
        dailyRateMad: z.number().positive(),
        vehicleLabel: z.string().describe("e.g. 'Dacia Duster' — for the summary shown to the human"),
        customerLabel: z.string().describe("Customer's name — for the summary shown to the human"),
      }),
      execute: async (input) => {
        if (!input.customerId && !(input.quickCustomerName && input.quickCustomerPhone)) {
          return { error: "Need either an existing customerId or a quickCustomerName and quickCustomerPhone." }
        }
        if (!input.vehicleId && !input.requestedCategory) {
          return { error: "Need either a vehicleId or a requestedCategory." }
        }
        const pricing = calculatePricing({
          dailyRateMad: input.dailyRateMad,
          pickupAt: input.pickupAtLocal,
          returnAt: input.returnAtLocal,
        })
        const summary = `${input.customerLabel} — ${input.vehicleLabel} — ${pricing.numDays} day(s) — ${pricing.totalMad} MAD`
        return createProposal(session, conversationId, "create_reservation", summary, { ...input })
      },
    }),

    propose_record_payment: tool({
      description: "Prepare recording a payment against an existing reservation, for human confirmation. Look up the reservation with find_reservation first.",
      inputSchema: z.object({
        reservationId: z.string(),
        reservationReference: z.string(),
        customerId: z.string(),
        amountMad: z.number().positive(),
        method: z.enum(["cash", "card", "transfer", "other"]),
        transactionType: z.enum(["rental_payment", "additional_charge", "damage_charge", "refund"]).default("rental_payment"),
        notes: z.string().optional(),
      }),
      execute: async (input) => {
        const summary = `Record ${input.amountMad} MAD (${input.method}) on ${input.reservationReference}`
        return createProposal(session, conversationId, "record_payment", summary, { ...input })
      },
    }),

    propose_cancel_reservation: tool({
      description: "Prepare cancelling an existing reservation, for human confirmation. Look up the reservation with find_reservation first.",
      inputSchema: z.object({
        reservationId: z.string(),
        reservationReference: z.string(),
        reason: z.string().optional(),
      }),
      execute: async (input) => {
        const summary = `Cancel reservation ${input.reservationReference}${input.reason ? ` — ${input.reason}` : ""}`
        return createProposal(session, conversationId, "cancel_reservation", summary, { ...input })
      },
    }),

    propose_schedule_maintenance: tool({
      description: "Prepare scheduling maintenance for a vehicle, for human confirmation.",
      inputSchema: z.object({
        vehicleId: z.string(),
        vehicleLabel: z.string(),
        type: z.enum(MAINTENANCE_TYPES),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        scheduledOn: z.string().describe("YYYY-MM-DD").optional(),
        description: z.string().optional(),
        estimatedCostMad: z.number().nonnegative().optional(),
      }),
      execute: async (input) => {
        const summary = `Schedule ${input.type.replace(/_/g, " ")} for ${input.vehicleLabel}${input.scheduledOn ? ` on ${input.scheduledOn}` : ""}`
        return createProposal(session, conversationId, "schedule_maintenance", summary, { ...input })
      },
    }),
  }
}

export type { ProposedActionType }
export { MAINTENANCE_TYPES }
