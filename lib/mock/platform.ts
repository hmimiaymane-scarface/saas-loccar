import type { MigrationChecklistItem, PlatformAuditEvent, PlatformCompanyRow, PlatformCompanySummary, PlatformOverview } from "@/types/platform"
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
