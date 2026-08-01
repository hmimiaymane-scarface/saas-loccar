import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import type { PaginatedResult } from "@/lib/data"
import {
  mockPlatformAuditEvents,
  mockPlatformCompanies,
  mockPlatformCompanySummary,
  mockPlatformOverview,
  mockMigrationChecklist,
  mockUsageAnalyticsSummary,
  mockDropoffSummary,
} from "@/lib/mock/platform"
import type {
  DropoffStep,
  MigrationChecklistItem,
  PlatformAuditEvent,
  PlatformCompanyListFilters,
  PlatformCompanyRow,
  PlatformCompanySummary,
  PlatformOverview,
  SubscriptionStatus,
  UsageAnalyticsSummary,
  UsageFlow,
} from "@/types/platform"

function isMockMode() {
  return !isSupabaseConfigured || process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true"
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  if (isMockMode()) return mockPlatformOverview

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("platform_get_overview")
  if (error) throw error
  const row = data?.[0]
  if (!row) {
    return {
      totalCompanies: 0,
      activeSubscriptions: 0,
      activeTrials: 0,
      trialsEndingSoon: 0,
      suspendedCompanies: 0,
      companiesActiveRecently: 0,
      totalVehicles: 0,
      reservationsCreatedRecently: 0,
      documentsUploadedThisMonth: 0,
    }
  }
  return {
    totalCompanies: row.total_companies,
    activeSubscriptions: row.active_subscriptions,
    activeTrials: row.active_trials,
    trialsEndingSoon: row.trials_ending_soon,
    suspendedCompanies: row.suspended_companies,
    companiesActiveRecently: row.companies_active_recently,
    totalVehicles: row.total_vehicles,
    reservationsCreatedRecently: row.reservations_created_recently,
    documentsUploadedThisMonth: row.documents_uploaded_this_month,
  }
}

export async function getPlatformCompaniesList(
  filters: PlatformCompanyListFilters = {},
  page = 1,
  pageSize = 25
): Promise<PaginatedResult<PlatformCompanyRow>> {
  if (isMockMode()) {
    let items = [...mockPlatformCompanies]
    if (filters.search) {
      const q = filters.search.toLowerCase()
      items = items.filter((c) => c.name.toLowerCase().includes(q))
    }
    if (filters.status) items = items.filter((c) => c.subscriptionStatus === filters.status)
    items.sort((a, b) =>
      filters.sort === "created_at"
        ? b.createdAt.localeCompare(a.createdAt)
        : (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "")
    )
    const total = items.length
    const start = (page - 1) * pageSize
    return { items: items.slice(start, start + pageSize), total, page, pageSize }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("platform_list_companies", {
    p_search: filters.search || null,
    p_status: filters.status || null,
    p_sort: filters.sort ?? "activity",
    p_page: page,
    p_page_size: pageSize,
  })
  if (error) throw error

  const rows = data ?? []
  const total = rows[0]?.total_count ?? 0
  return {
    items: rows.map((r) => ({
      companyId: r.company_id,
      name: r.name,
      city: r.city,
      ownerEmail: r.owner_email,
      subscriptionStatus: r.subscription_status as SubscriptionStatus | null,
      planLabel: r.plan_label,
      trialOrRenewalDate: r.trial_or_renewal_date,
      vehicleCount: r.vehicle_count,
      reservationCount: r.reservation_count,
      lastActivityAt: r.last_activity_at,
      createdAt: r.created_at,
    })),
    total,
    page,
    pageSize,
  }
}

export async function getPlatformCompanySummary(companyId: string): Promise<PlatformCompanySummary | null> {
  if (isMockMode()) return mockPlatformCompanySummary(companyId)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("platform_get_company_summary", { p_company_id: companyId })
  if (error) throw error
  const row = data?.[0]
  if (!row) return null

  return {
    companyId,
    name: row.name,
    city: row.city,
    ownerEmail: row.owner_email,
    ownerFullName: row.owner_full_name,
    createdAt: row.created_at,
    userCount: row.user_count,
    branchCount: row.branch_count,
    vehicleCount: row.vehicle_count,
    customerCount: row.customer_count,
    reservationCount: row.reservation_count,
    activeRentalCount: row.active_rental_count,
    documentCount: row.document_count,
    documentsThisMonthCount: row.documents_this_month_count,
    lastActivityAt: row.last_activity_at,
    subscription: {
      status: (row.subscription_status ?? "trial") as SubscriptionStatus,
      planLabel: row.plan_label ?? "Trial",
      trialStartsOn: row.trial_starts_on,
      trialEndsOn: row.trial_ends_on,
      subscriptionStartsOn: row.subscription_starts_on,
      subscriptionEndsOn: row.subscription_ends_on,
      monthlyPriceMad: row.monthly_price_mad,
      currency: row.currency ?? "MAD",
      notes: row.notes,
      notesUpdatedAt: row.notes_updated_at,
      notesUpdatedByEmail: row.notes_updated_by_email,
    },
  }
}

export async function getPlatformCompanyEvents(companyId: string, limit = 20): Promise<PlatformAuditEvent[]> {
  if (isMockMode()) return mockPlatformAuditEvents

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("platform_get_company_events", {
    p_company_id: companyId,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    adminEmail: r.admin_email,
    action: r.action,
    description: r.description,
    createdAt: r.created_at,
  }))
}

/** Roadmap phase 49 — the founder-assisted onboarding checklist for
 * one company, in fixed step order (see
 * lib/platform/migration-checklist.ts). */
export async function getMigrationChecklist(companyId: string): Promise<MigrationChecklistItem[]> {
  if (isMockMode()) return mockMigrationChecklist(companyId)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("platform_get_migration_checklist", { p_company_id: companyId })
  if (error) throw error
  return (data ?? []).map((r) => ({
    stepKey: r.step_key,
    sortOrder: r.sort_order,
    isDone: r.is_done,
    completedAt: r.completed_at,
    completedByEmail: r.completed_by_email,
  }))
}

/** Roadmap phase 58 — cross-company product-usage aggregate over the
 * trailing `windowDays`, backing /platform/analytics. See
 * lib/analytics/track.ts for what feeds usage_events. */
export async function getUsageAnalyticsSummary(windowDays = 30): Promise<UsageAnalyticsSummary> {
  if (isMockMode()) return { ...mockUsageAnalyticsSummary, windowDays }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("platform_get_usage_summary", { p_days: windowDays })
  if (error) throw error
  const row = data?.[0]
  if (!row) {
    return {
      windowDays,
      newRentalStarted: 0,
      newRentalCompleted: 0,
      newRentalMedianSeconds: null,
      returnStarted: 0,
      returnCompleted: 0,
      returnMedianSeconds: null,
      searchOpened: 0,
      searchQueryRun: 0,
      quickActionUsed: 0,
      alertActionUsed: 0,
      errorOccurred: 0,
      importCompleted: 0,
      pwaInstallAccepted: 0,
      pwaInstallDismissed: 0,
      pwaInstalled: 0,
    }
  }
  return {
    windowDays,
    newRentalStarted: row.new_rental_started,
    newRentalCompleted: row.new_rental_completed,
    newRentalMedianSeconds: row.new_rental_median_seconds,
    returnStarted: row.return_started,
    returnCompleted: row.return_completed,
    returnMedianSeconds: row.return_median_seconds,
    searchOpened: row.search_opened,
    searchQueryRun: row.search_query_run,
    quickActionUsed: row.quick_action_used,
    alertActionUsed: row.alert_action_used,
    errorOccurred: row.error_occurred,
    importCompleted: row.import_completed,
    pwaInstallAccepted: row.pwa_install_accepted,
    pwaInstallDismissed: row.pwa_install_dismissed,
    pwaInstalled: row.pwa_installed,
  }
}

/** Roadmap phase 58 — how many attempts (sessions) reached each step of
 * one funnel, furthest-step-per-session (not raw view counts). */
export async function getDropoffSummary(flow: UsageFlow, windowDays = 30): Promise<DropoffStep[]> {
  if (isMockMode()) return mockDropoffSummary(flow)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("platform_get_dropoff_summary", { p_flow: flow, p_days: windowDays })
  if (error) throw error
  return (data ?? []).map((r) => ({
    step: r.step,
    stepLabel: r.step_label,
    sessionsReached: r.sessions_reached,
  }))
}
