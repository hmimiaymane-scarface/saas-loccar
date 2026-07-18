import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Car, Gauge, Wallet, User } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getMaintenanceDetail, getUpcomingReservationConflicts } from "@/lib/data"
import { formatDate, formatMad } from "@/lib/format"
import { maintenanceRecordStatusConfig, maintenancePriorityConfig, MAINTENANCE_TYPE_LABELS } from "@/lib/status"
import { SectionHeader } from "@/components/domain/section-header"
import { StatusBadge } from "@/components/domain/status-badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { MaintenanceDetailActions } from "@/components/domain/maintenance/maintenance-detail-actions"
import { MaintenanceEditForm } from "@/components/domain/maintenance/maintenance-edit-form"
import { MaintenanceReceiptUpload } from "@/components/domain/maintenance/maintenance-receipt-upload"

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  const { id } = await params
  const record = await getMaintenanceDetail(session.company.id, id)
  if (!record) notFound()

  const conflicts =
    record.status === "planned" || record.status === "scheduled"
      ? await getUpcomingReservationConflicts(session.company.id, record.vehicleId)
      : []

  return (
    <>
      <SectionHeader
        title={MAINTENANCE_TYPE_LABELS[record.type] ?? record.type}
        description={`${record.vehicleLabel} · ${record.vehiclePlate}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge visual={maintenancePriorityConfig[record.priority]} />
            <StatusBadge visual={maintenanceRecordStatusConfig[record.status]} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="flex items-center gap-2.5">
                  <Car className="size-4 text-muted-foreground" />
                  <Link href={`/fleet/${record.vehicleId}`} className="text-foreground hover:underline">
                    {record.vehicleLabel}
                  </Link>
                </div>
                {record.odometerKm != null && (
                  <div className="flex items-center gap-2.5">
                    <Gauge className="size-4 text-muted-foreground" />
                    <span className="text-foreground">{record.odometerKm.toLocaleString()} km</span>
                  </div>
                )}
                <div className="text-muted-foreground">
                  Scheduled <span className="text-foreground">{record.scheduledOn ? formatDate(record.scheduledOn) : "—"}</span>
                </div>
                <div className="text-muted-foreground">
                  Started <span className="text-foreground">{record.startedOn ? formatDate(record.startedOn) : "—"}</span>
                </div>
                <div className="text-muted-foreground">
                  Completed <span className="text-foreground">{record.completedOn ? formatDate(record.completedOn) : "—"}</span>
                </div>
                {record.supplier && (
                  <div className="text-muted-foreground">
                    Supplier <span className="text-foreground">{record.supplier}</span>
                  </div>
                )}
              </div>
              {record.description && (
                <>
                  <Separator />
                  <p className="text-sm whitespace-pre-wrap text-foreground">{record.description}</p>
                </>
              )}
              {record.notes && (
                <>
                  <Separator />
                  <p className="text-xs whitespace-pre-wrap text-muted-foreground">{record.notes}</p>
                </>
              )}
            </CardContent>
          </Card>

          {(record.nextServiceOn || record.nextServiceOdometerKm) && (
            <Card>
              <CardHeader>
                <CardTitle>Next service</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-6 text-sm">
                {record.nextServiceOn && (
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Date</span>
                    <span className="text-foreground">{formatDate(record.nextServiceOn)}</span>
                  </div>
                )}
                {record.nextServiceOdometerKm && (
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Odometer</span>
                    <span className="text-foreground">{record.nextServiceOdometerKm.toLocaleString()} km</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Receipt</CardTitle>
            </CardHeader>
            <CardContent>
              <MaintenanceReceiptUpload maintenanceId={record.id} companyId={session.company.id} hasReceipt={Boolean(record.receiptUrl)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Edit</CardTitle>
            </CardHeader>
            <CardContent>
              <MaintenanceEditForm record={record} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Wallet className="size-3.5" /> Estimated
                </span>
                <span className="text-foreground">{record.estimatedCostMad != null ? formatMad(record.estimatedCostMad) : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Actual</span>
                <span className="text-foreground">{record.actualCostMad != null ? formatMad(record.actualCostMad) : "—"}</span>
              </div>
              {record.hasLinkedExpense && (
                <p className="text-xs text-muted-foreground">Linked to an expense record — counted once in reports.</p>
              )}
              <Separator />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <User className="size-3.5" /> Recorded by
                </span>
                <span>{record.createdByName ?? "Unknown"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <MaintenanceDetailActions record={record} conflicts={conflicts} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
