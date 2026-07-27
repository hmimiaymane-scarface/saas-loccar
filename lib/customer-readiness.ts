/**
 * Roadmap phase 09 requirement 4 — the Returning-Customer Fast Path's
 * "should we interrupt" check. Pure and tiny on purpose: given what's
 * already loaded for a customer (no new query of its own), decide
 * whether they can skip straight to vehicle selection or need one
 * specific thing fixed first.
 *
 * Deliberately reuses the same two signals phase 08's trust score
 * already established as this codebase's definition of "verified":
 * - driving licence: `customers.license_expires_on` (already the
 *   field the customer detail page displays and flags when expired —
 *   not a second, competing "licence document" concept).
 * - identity: an active `identity_document`-category upload (same
 *   `hasVerifiedIdentity` signal as
 *   `lib/customer-intelligence-store.ts#gatherCustomerRawData`), now
 *   also checked for its own expiry if one was recorded.
 */

export interface ReturningCustomerReadinessDocument {
  category: string
  expiresOn: string | null
}

export interface ReturningCustomerReadinessInput {
  licenseExpiresAt: string | null
  documents: ReturningCustomerReadinessDocument[]
  now?: Date
}

export type ReadinessIssue =
  | { type: "licence_missing" }
  | { type: "licence_expired"; expiresOn: string }
  | { type: "identity_missing" }
  | { type: "identity_expired"; expiresOn: string }

export interface ReturningCustomerReadiness {
  ready: boolean
  issues: ReadinessIssue[]
}

function isPast(dateIso: string, nowMs: number): boolean {
  return new Date(dateIso).getTime() < nowMs
}

/**
 * A customer is fast-path ready when both signals check out. Multiple
 * active identity documents (e.g. a renewed passport uploaded
 * alongside an old one) only count as expired when *every one of them*
 * is past its expiry — one valid document is enough, same "any current
 * proof is proof" logic a human agent would apply.
 */
export function assessReturningCustomerReadiness(
  input: ReturningCustomerReadinessInput
): ReturningCustomerReadiness {
  const nowMs = (input.now ?? new Date()).getTime()
  const issues: ReadinessIssue[] = []

  if (!input.licenseExpiresAt) {
    issues.push({ type: "licence_missing" })
  } else if (isPast(input.licenseExpiresAt, nowMs)) {
    issues.push({ type: "licence_expired", expiresOn: input.licenseExpiresAt })
  }

  const identityDocs = input.documents.filter((d) => d.category === "identity_document")
  if (identityDocs.length === 0) {
    issues.push({ type: "identity_missing" })
  } else {
    const withExpiry = identityDocs.filter((d): d is { category: string; expiresOn: string } => d.expiresOn != null)
    const allExpired = withExpiry.length === identityDocs.length && withExpiry.every((d) => isPast(d.expiresOn, nowMs))
    if (allExpired) {
      const latestExpiry = withExpiry.reduce((latest, d) => (d.expiresOn > latest ? d.expiresOn : latest), withExpiry[0].expiresOn)
      issues.push({ type: "identity_expired", expiresOn: latestExpiry })
    }
  }

  return { ready: issues.length === 0, issues }
}

/**
 * Productization wave 1 phase 11 — the Home screen's "missing
 * document" card is the same `identity_missing`/`identity_expired`
 * signal above, just run across every customer with a pickup coming up
 * soon instead of one customer at a time on the Customer Command
 * Center. Pure by the same design: the DB-facing fetch lives in
 * `lib/customer-readiness-store.ts`, this only decides what the
 * already-fetched rows mean.
 */
export interface UpcomingPickupCustomer {
  customerId: string
  customerName: string
  reservationId: string
  pickupAt: string
  licenseExpiresAt: string | null
  documents: ReturningCustomerReadinessDocument[]
}

export interface MissingIdentityDocumentFlag {
  customerId: string
  customerName: string
  reservationId: string
  pickupAt: string
}

/**
 * A customer with more than one upcoming reservation is only flagged
 * once, keeping the soonest pickup — that's the one that actually
 * needs attention first. Only the identity-document signal is
 * surfaced here; a licence-expiry issue is a different fix (edit a
 * date field, not upload a file) and already has its own advisory on
 * the customer page.
 */
export function findCustomersMissingIdentityDocument(
  customers: UpcomingPickupCustomer[],
  now?: Date
): MissingIdentityDocumentFlag[] {
  const flagsByCustomer = new Map<string, MissingIdentityDocumentFlag>()

  for (const customer of customers) {
    const existing = flagsByCustomer.get(customer.customerId)
    if (existing && existing.pickupAt <= customer.pickupAt) continue

    const readiness = assessReturningCustomerReadiness({
      licenseExpiresAt: customer.licenseExpiresAt,
      documents: customer.documents,
      now,
    })
    const missingIdentity = readiness.issues.some((issue) => issue.type === "identity_missing" || issue.type === "identity_expired")
    if (!missingIdentity) continue

    flagsByCustomer.set(customer.customerId, {
      customerId: customer.customerId,
      customerName: customer.customerName,
      reservationId: customer.reservationId,
      pickupAt: customer.pickupAt,
    })
  }

  return [...flagsByCustomer.values()]
}
