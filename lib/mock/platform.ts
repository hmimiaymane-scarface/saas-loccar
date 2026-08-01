import type {
  AiCallSummary,
  DropoffStep,
  MigrationChecklistItem,
  OperationalEventRow,
  OperationalSummary,
  PilotFeedbackItem,
  PlatformAuditEvent,
  ProductSignalItem,
  PlatformCompanyRow,
  PlatformCompanySummary,
  PlatformOverview,
  UsageAnalyticsSummary,
  UsageFlow,
} from "@/types/platform"
import { MIGRATION_CHECKLIST_STEPS } from "@/lib/platform/migration-checklist"

const now = new Date()
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000).toISOString().slice(0, 10)
const daysAgoDate = (n: number) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10)

export const mockPlatformCompanies: PlatformCompanyRow[] = [
  {
    companyId: "pc_atlas",
    name: "Atlas Rent Car",
    city: "Marrakech",
    ownerEmail: "owner@atlasrentcar.ma",
    subscriptionStatus: "active",
    planLabel: "Standard",
    trialOrRenewalDate: daysFromNow(45),
    vehicleCount: 6,
    reservationCount: 38,
    lastActivityAt: daysAgo(0),
    createdAt: daysAgo(120),
  },
  {
    companyId: "pc_sahara",
    name: "Sahara Wheels",
    city: "Agadir",
    ownerEmail: "contact@saharawheels.ma",
    subscriptionStatus: "trial",
    planLabel: "Trial",
    trialOrRenewalDate: daysFromNow(3),
    vehicleCount: 4,
    reservationCount: 9,
    lastActivityAt: daysAgo(1),
    createdAt: daysAgo(11),
  },
  {
    companyId: "pc_medina",
    name: "Medina Auto Location",
    city: "Fes",
    ownerEmail: "medina.auto@example.com",
    subscriptionStatus: "trial",
    planLabel: "Trial",
    trialOrRenewalDate: daysFromNow(12),
    vehicleCount: 2,
    reservationCount: 3,
    lastActivityAt: daysAgo(4),
    createdAt: daysAgo(2),
  },
  {
    companyId: "pc_ocean",
    name: "Ocean Drive Rentals",
    city: "Casablanca",
    ownerEmail: "hello@oceandrive.ma",
    subscriptionStatus: "suspended",
    planLabel: "Standard",
    trialOrRenewalDate: null,
    vehicleCount: 9,
    reservationCount: 52,
    lastActivityAt: daysAgo(21),
    createdAt: daysAgo(200),
  },
  {
    companyId: "pc_najma",
    name: "Najma Cars",
    city: "Rabat",
    ownerEmail: "najma.cars@example.com",
    subscriptionStatus: "cancelled",
    planLabel: "Custom",
    trialOrRenewalDate: null,
    vehicleCount: 3,
    reservationCount: 14,
    lastActivityAt: daysAgo(60),
    createdAt: daysAgo(300),
  },
]

export const mockPlatformOverview: PlatformOverview = {
  totalCompanies: mockPlatformCompanies.length,
  activeSubscriptions: mockPlatformCompanies.filter((c) => c.subscriptionStatus === "active").length,
  activeTrials: mockPlatformCompanies.filter((c) => c.subscriptionStatus === "trial").length,
  trialsEndingSoon: 1,
  suspendedCompanies: mockPlatformCompanies.filter((c) => c.subscriptionStatus === "suspended").length,
  companiesActiveRecently: 3,
  totalVehicles: mockPlatformCompanies.reduce((sum, c) => sum + c.vehicleCount, 0),
  reservationsCreatedRecently: 12,
  documentsUploadedThisMonth: 27,
}

export const mockPlatformAuditEvents: PlatformAuditEvent[] = [
  { id: "pae_1", adminEmail: "admin@platform.example", action: "company_suspended", description: "Overdue invoice, contacted by phone first", createdAt: daysAgo(21) },
  { id: "pae_2", adminEmail: "admin@platform.example", action: "trial_extended", description: "Trial set to end in 3 days", createdAt: daysAgo(8) },
  { id: "pae_3", adminEmail: "admin@platform.example", action: "subscription_activated", description: null, createdAt: daysAgo(45) },
]

// Roadmap phase 63 — in-app feedback a pilot submitted from /support.
export const mockPilotFeedback: PilotFeedbackItem[] = [
  {
    id: "pf_1",
    message: "Love the new Quick Actions button — saves us a ton of taps during a busy morning.",
    pageContext: "/overview",
    submittedByEmail: "owner@atlasrentcar.ma",
    createdAt: daysAgo(2),
  },
  {
    id: "pf_2",
    message: "Wish the deposit amount showed up on the pickup screen itself instead of having to go back to the reservation.",
    pageContext: "/reservations/bk_2/pickup",
    submittedByEmail: "owner@atlasrentcar.ma",
    createdAt: daysAgo(6),
  },
]

// Roadmap phase 64 — founder-logged observations of real pilot
// behavior, ranked by impact * frequency (the mock's own `priority`
// values are pre-sorted descending, matching what the real RPC
// returns — see lib/platform/product-signals.ts#productSignalPriority).
export const mockProductSignals: ProductSignalItem[] = [
  {
    id: "sig_1",
    companyId: "pc_atlas",
    companyName: "Atlas Rent Car",
    signalType: "asked_us_to_do",
    note: "Owner asks us to change a reservation's dates every time a customer calls to extend — there's no self-serve way for them to do it (matches the known extension/exchange gap).",
    impact: 3,
    frequency: 3,
    priority: 9,
    status: "open",
    loggedByEmail: "admin@platform.example",
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
  },
  {
    id: "sig_2",
    companyId: "pc_atlas",
    companyName: "Atlas Rent Car",
    signalType: "hesitates",
    note: "Pauses every time on the deposit step during pickup — unsure whether to collect cash before or after the inspection photos.",
    impact: 2,
    frequency: 2,
    priority: 4,
    status: "planned",
    loggedByEmail: "admin@platform.example",
    createdAt: daysAgo(9),
    updatedAt: daysAgo(2),
  },
  {
    id: "sig_3",
    companyId: "pc_atlas",
    companyName: "Atlas Rent Car",
    signalType: "whatsapp_workaround",
    note: "Still confirms every pickup time with the customer over their own WhatsApp instead of the in-app WhatsApp action — didn't realize the app one exists.",
    impact: 1,
    frequency: 3,
    priority: 3,
    status: "open",
    loggedByEmail: "admin@platform.example",
    createdAt: daysAgo(12),
    updatedAt: daysAgo(12),
  },
  {
    id: "sig_4",
    companyId: "pc_atlas",
    companyName: "Atlas Rent Car",
    signalType: "enjoys",
    note: "Checks the Overview page unprompted first thing every morning, even before opening WhatsApp.",
    impact: 1,
    frequency: 1,
    priority: 1,
    status: "shipped",
    loggedByEmail: "admin@platform.example",
    createdAt: daysAgo(20),
    updatedAt: daysAgo(20),
  },
]

export function mockPlatformCompanySummary(companyId: string): PlatformCompanySummary | null {
  const row = mockPlatformCompanies.find((c) => c.companyId === companyId)
  if (!row) return null
  return {
    companyId: row.companyId,
    name: row.name,
    city: row.city,
    ownerEmail: row.ownerEmail,
    ownerFullName: "Demo Owner",
    createdAt: row.createdAt,
    userCount: 2,
    branchCount: 1,
    vehicleCount: row.vehicleCount,
    customerCount: 24,
    reservationCount: row.reservationCount,
    activeRentalCount: row.subscriptionStatus === "suspended" ? 0 : 2,
    documentCount: 18,
    documentsThisMonthCount: 5,
    lastActivityAt: row.lastActivityAt,
    subscription: {
      status: row.subscriptionStatus ?? "trial",
      planLabel: row.planLabel ?? "Trial",
      trialStartsOn: row.subscriptionStatus === "trial" ? daysAgoDate(11) : null,
      trialEndsOn: row.subscriptionStatus === "trial" ? row.trialOrRenewalDate : null,
      subscriptionStartsOn: row.subscriptionStatus === "active" ? daysAgoDate(90) : null,
      subscriptionEndsOn: row.subscriptionStatus === "active" ? row.trialOrRenewalDate : null,
      monthlyPriceMad: row.subscriptionStatus === "trial" ? null : 899,
      currency: "MAD",
      notes: row.subscriptionStatus === "suspended" ? "Overdue invoice — contacted 2026-06-28, promised payment by end of month." : null,
      notesUpdatedAt: row.subscriptionStatus === "suspended" ? daysAgo(21) : null,
      notesUpdatedByEmail: row.subscriptionStatus === "suspended" ? "admin@platform.example" : null,
    },
  }
}

/** Roadmap phase 49 — mock progress varies per company so the demo
 * shows the full range of states: a long-settled company fully
 * onboarded, a mid-migration trial, and a brand-new signup where only
 * the structurally-guaranteed owner_login_created step is done. */
const MOCK_DONE_STEPS: Record<string, Set<string>> = {
  pc_atlas: new Set(MIGRATION_CHECKLIST_STEPS.map((s) => s.key)),
  pc_sahara: new Set(["spreadsheet_received", "spreadsheet_cleaned", "data_imported", "owner_login_created"]),
  pc_medina: new Set(["owner_login_created"]),
  pc_ocean: new Set(MIGRATION_CHECKLIST_STEPS.map((s) => s.key)),
  pc_najma: new Set(MIGRATION_CHECKLIST_STEPS.map((s) => s.key)),
}

/** Roadmap phase 58 — plausible demo numbers for /platform/analytics, in
 * the same spirit as mockPlatformOverview: round, internally consistent
 * (completed <= started, median only present where completions exist). */
export const mockUsageAnalyticsSummary: UsageAnalyticsSummary = {
  windowDays: 30,
  newRentalStarted: 64,
  newRentalCompleted: 47,
  newRentalMedianSeconds: 312,
  returnStarted: 41,
  returnCompleted: 38,
  returnMedianSeconds: 198,
  searchOpened: 156,
  searchQueryRun: 289,
  quickActionUsed: 203,
  alertActionUsed: 71,
  errorOccurred: 9,
  importCompleted: 5,
  pwaInstallAccepted: 6,
  pwaInstallDismissed: 14,
  pwaInstalled: 5,
}

const NEW_RENTAL_STEP_LABELS = ["Customer", "Vehicle & price", "Payment", "Inspection", "Contract"]
const RETURN_STEP_LABELS = ["Return details", "Inspection", "Damage", "Charges & deposit", "Complete"]

export function mockDropoffSummary(flow: UsageFlow): DropoffStep[] {
  const labels = flow === "new_rental" ? NEW_RENTAL_STEP_LABELS : RETURN_STEP_LABELS
  const started = flow === "new_rental" ? mockUsageAnalyticsSummary.newRentalStarted : mockUsageAnalyticsSummary.returnStarted
  const completed = flow === "new_rental" ? mockUsageAnalyticsSummary.newRentalCompleted : mockUsageAnalyticsSummary.returnCompleted
  const dropPerStep = Math.max(1, Math.round((started - completed) / labels.length))
  return labels.map((label, index) => ({
    step: index,
    stepLabel: label,
    sessionsReached: Math.max(completed, started - dropPerStep * index),
  }))
}

export function mockMigrationChecklist(companyId: string): MigrationChecklistItem[] {
  const done = MOCK_DONE_STEPS[companyId] ?? new Set(["owner_login_created"])
  return MIGRATION_CHECKLIST_STEPS.map((step, index) => ({
    stepKey: step.key,
    sortOrder: index + 1,
    isDone: done.has(step.key),
    completedAt: done.has(step.key) ? daysAgo(Math.max(0, 10 - index)) : null,
    completedByEmail: done.has(step.key) ? "admin@platform.example" : null,
  }))
}

/** Roadmap phase 59 — plausible demo numbers for /platform/operations,
 * same spirit as mockUsageAnalyticsSummary: round, mostly-quiet (a
 * healthy app should have few of these), internally consistent with
 * mockRecentOperationalEvents below. */
export const mockOperationalSummary: OperationalSummary = {
  windowDays: 7,
  frontendErrors: 3,
  apiRouteErrors: 1,
  cronJobFailures: 0,
  notificationFailures: 2,
  uploadFailures: 1,
  slowRoutes: 4,
}

export const mockRecentOperationalEvents: OperationalEventRow[] = [
  { id: "oe_1", companyName: "Sahara Wheels", source: "upload", severity: "error", context: "storage_upload", message: "The object exceeded the maximum allowed size", durationMs: null, createdAt: daysAgo(0) },
  { id: "oe_2", companyName: "Atlas Rent Car", source: "notification", severity: "error", context: "push", message: "Push service returned 500", durationMs: null, createdAt: daysAgo(1) },
  { id: "oe_3", companyName: null, source: "slow_route", severity: "warning", context: "ai-assistant/chat", message: "ai-assistant/chat took 4210ms", durationMs: 4210, createdAt: daysAgo(1) },
  { id: "oe_4", companyName: "Atlas Rent Car", source: "frontend", severity: "error", context: "unhandled_rejection", message: "Failed to fetch", durationMs: null, createdAt: daysAgo(2) },
  { id: "oe_5", companyName: "Medina Auto Location", source: "api_route", severity: "error", context: "exports/reservations", message: "Request timed out", durationMs: 8021, createdAt: daysAgo(3) },
]

export const mockAiCallSummary: AiCallSummary = {
  windowDays: 7,
  totalCalls: 142,
  failedCalls: 6,
}
