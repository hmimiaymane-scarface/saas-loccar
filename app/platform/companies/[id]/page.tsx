import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getPlatformCompanySummary, getPlatformCompanyEvents, getMigrationChecklist } from "@/lib/platform-data"
import { subscriptionStatusConfig, PLATFORM_ACTION_LABELS } from "@/lib/platform-status"
import { migrationChecklistProgress } from "@/lib/platform/migration-checklist"
import { formatDate, formatMad, formatRelativeTime } from "@/lib/format"
import { SummaryRow } from "@/components/domain/summary-row"
import { SubscriptionActions } from "@/components/domain/platform/subscription-actions"
import { NotesEditor } from "@/components/domain/platform/notes-editor"
import { MigrationChecklistPanel } from "@/components/domain/platform/migration-checklist"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function PlatformCompanySummaryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const summary = await getPlatformCompanySummary(id)
  if (!summary) notFound()

  const events = await getPlatformCompanyEvents(id)
  const checklist = await getMigrationChecklist(id)
  const statusVisual = subscriptionStatusConfig[summary.subscription.status]
  const migrationProgress = migrationChecklistProgress(checklist)
  const onboardingLabel =
    migrationProgress.done === migrationProgress.total
      ? "Complete"
      : `${migrationProgress.done} of ${migrationProgress.total} steps`

  return (
    <>
      <Link href="/platform/companies" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Companies
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-medium text-foreground">{summary.name}</h1>
          <p className="text-sm text-muted-foreground">
            {summary.city ?? "—"} · Created {formatDate(summary.createdAt)}
          </p>
        </div>
        <Badge variant="outline" className={statusVisual.badge}>
          {statusVisual.label}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SummaryRow label="Owner" value={summary.ownerFullName ?? "—"} />
            <SummaryRow label="Owner email" value={summary.ownerEmail ?? "—"} />
            <SummaryRow label="Created" value={formatDate(summary.createdAt)} />
            <SummaryRow label="Onboarding" value={onboardingLabel} />
            <SummaryRow label="Users" value={String(summary.userCount)} />
            <SummaryRow label="Branches" value={String(summary.branchCount)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SummaryRow label="Vehicles" value={String(summary.vehicleCount)} />
            <SummaryRow label="Customers" value={String(summary.customerCount)} />
            <SummaryRow label="Reservations" value={String(summary.reservationCount)} />
            <SummaryRow label="Active rentals" value={String(summary.activeRentalCount)} />
            <SummaryRow label="Documents stored" value={String(summary.documentCount)} />
            <SummaryRow label="Documents this month" value={`${summary.documentsThisMonthCount} (uploads — extraction not yet enabled)`} />
            <SummaryRow
              label="Last activity"
              value={summary.lastActivityAt ? formatRelativeTime(summary.lastActivityAt) : "No activity yet"}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <SummaryRow label="Status" value={statusVisual.label} />
              <SummaryRow label="Plan" value={summary.subscription.planLabel} />
              <SummaryRow
                label="Trial period"
                value={
                  summary.subscription.trialStartsOn || summary.subscription.trialEndsOn
                    ? `${summary.subscription.trialStartsOn ? formatDate(summary.subscription.trialStartsOn) : "—"} – ${summary.subscription.trialEndsOn ? formatDate(summary.subscription.trialEndsOn) : "—"}`
                    : "—"
                }
              />
              <SummaryRow
                label="Subscription period"
                value={
                  summary.subscription.subscriptionStartsOn || summary.subscription.subscriptionEndsOn
                    ? `${summary.subscription.subscriptionStartsOn ? formatDate(summary.subscription.subscriptionStartsOn) : "—"} – ${summary.subscription.subscriptionEndsOn ? formatDate(summary.subscription.subscriptionEndsOn) : "—"}`
                    : "—"
                }
              />
              <SummaryRow
                label="Monthly price"
                value={summary.subscription.monthlyPriceMad != null ? formatMad(summary.subscription.monthlyPriceMad) : "Not set"}
              />
            </CardContent>
          </Card>

          <SubscriptionActions companyId={id} subscription={summary.subscription} />

          <MigrationChecklistPanel companyId={id} items={checklist} />
        </div>

        <div className="flex flex-col gap-6">
          <NotesEditor
            companyId={id}
            notes={summary.subscription.notes}
            notesUpdatedAt={summary.subscription.notesUpdatedAt}
            notesUpdatedByEmail={summary.subscription.notesUpdatedByEmail}
          />

          <Card>
            <CardHeader>
              <CardTitle>Recent platform-relevant events</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {events.length === 0 ? (
                <p className="px-6 py-4 text-sm text-muted-foreground">No platform actions recorded yet.</p>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="flex flex-col gap-0.5 px-6 py-3">
                    <span className="text-sm text-foreground">{PLATFORM_ACTION_LABELS[e.action] ?? e.action}</span>
                    {e.description && <span className="text-xs text-muted-foreground">{e.description}</span>}
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(e.createdAt)}
                      {e.adminEmail ? ` · ${e.adminEmail}` : ""}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
