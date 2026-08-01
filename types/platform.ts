/** Platform-owner (SaaS admin) domain types — entirely separate from
 * types/rental.ts, which is the tenant-facing domain. Nothing here is
 * ever shown inside the rental-company dashboard. */

export type SubscriptionStatus = "trial" | "active" | "suspended" | "cancelled"

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["trial", "active", "suspended", "cancelled"]

export interface PlatformOverview {
  totalCompanies: number
  activeSubscriptions: number
  activeTrials: number
  trialsEndingSoon: number
  suspendedCompanies: number
  companiesActiveRecently: number
  totalVehicles: number
  reservationsCreatedRecently: number
  /** A proxy for "document extraction usage" — this app doesn't have an
   * automated extraction/OCR pipeline yet, so this counts document
   * uploads instead. See the UI label, which says so explicitly. */
  documentsUploadedThisMonth: number
}

export interface PlatformCompanyRow {
  companyId: string
  name: string
  city: string | null
  ownerEmail: string | null
  subscriptionStatus: SubscriptionStatus | null
  planLabel: string | null
  trialOrRenewalDate: string | null
  vehicleCount: number
  reservationCount: number
  lastActivityAt: string | null
  createdAt: string
}

export interface PlatformCompanyListFilters {
  search?: string
  status?: SubscriptionStatus
  sort?: "activity" | "created_at"
}

export interface PlatformCompanySummary {
  companyId: string
  name: string
  city: string | null
  ownerEmail: string | null
  ownerFullName: string | null
  createdAt: string
  userCount: number
  branchCount: number
  vehicleCount: number
  customerCount: number
  reservationCount: number
  activeRentalCount: number
  documentCount: number
  documentsThisMonthCount: number
  lastActivityAt: string | null
  subscription: {
    status: SubscriptionStatus
    planLabel: string
    trialStartsOn: string | null
    trialEndsOn: string | null
    subscriptionStartsOn: string | null
    subscriptionEndsOn: string | null
    monthlyPriceMad: number | null
    currency: string
    notes: string | null
    notesUpdatedAt: string | null
    notesUpdatedByEmail: string | null
  }
}

export interface PlatformAuditEvent {
  id: string
  adminEmail: string | null
  action: string
  description: string | null
  createdAt: string
}

/** Roadmap phase 49 — one row of the founder-assisted white-glove
 * onboarding checklist (see lib/platform/migration-checklist.ts for
 * the fixed step list this `stepKey` refers into). */
export interface MigrationChecklistItem {
  stepKey: string
  sortOrder: number
  isDone: boolean
  completedAt: string | null
  completedByEmail: string | null
}

/** Roadmap phase 58 — cross-company product-usage aggregate, over a
 * trailing window (see lib/analytics for the event stream this is
 * computed from). Median seconds are null, not 0, when no session in
 * the window completed the funnel — there's no meaningful median of
 * zero observations. */
export interface UsageAnalyticsSummary {
  windowDays: number
  newRentalStarted: number
  newRentalCompleted: number
  newRentalMedianSeconds: number | null
  returnStarted: number
  returnCompleted: number
  returnMedianSeconds: number | null
  searchOpened: number
  searchQueryRun: number
  quickActionUsed: number
  alertActionUsed: number
  errorOccurred: number
  importCompleted: number
  pwaInstallAccepted: number
  pwaInstallDismissed: number
  pwaInstalled: number
}

export type UsageFlow = "new_rental" | "return"

export interface DropoffStep {
  step: number
  stepLabel: string | null
  sessionsReached: number
}
