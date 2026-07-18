import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Pencil, Plus, Gauge, MapPin, AlertTriangle } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getVehicleDetail } from "@/lib/data"
import { formatMad, formatDate, formatDateTime } from "@/lib/format"
import { vehicleStatusConfig, damageStatusConfig } from "@/lib/status"
import { StatusBadge } from "@/components/domain/status-badge"
import { SectionHeader } from "@/components/domain/section-header"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ReservationRow } from "@/components/domain/reservations/reservation-row"
import { VehicleStatusActions } from "@/components/domain/fleet/vehicle-status-actions"
import { DocumentListItem } from "@/components/domain/documents/document-list-item"

function daysUntil(date: string, nowMs: number): number {
  return Math.floor((new Date(date).getTime() - nowMs) / 86400000)
}

function DocumentRow({ label, date, nowMs }: { label: string; date: string | null; nowMs: number }) {
  if (!date) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">Not set</span>
      </div>
    )
  }
  const days = daysUntil(date, nowMs)
  const tone =
    days < 0
      ? "text-red-600 dark:text-red-400"
      : days <= 30
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground"
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone}>
        {formatDate(date)}
        {days < 0 ? " · expired" : days <= 30 ? ` · ${days}d left` : ""}
      </span>
    </div>
  )
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const { id } = await params
  const vehicle = await getVehicleDetail(session.company.id, id)
  if (!vehicle) notFound()

  const canManage = session.role === "owner" || session.role === "manager"
  // Server Component rendered fresh per request — "now" here is correct,
  // not a stale memoized value the purity rule is meant to guard against.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()

  return (
    <>
      <SectionHeader
        title={`${vehicle.make} ${vehicle.model}`}
        description={`${vehicle.year} · ${vehicle.plate}${vehicle.branchName ? ` · ${vehicle.branchName}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/reservations/new?vehicleId=${vehicle.id}&rate=${vehicle.dailyRateMad}`}>
                <Plus />
                New reservation
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/damages/new?vehicle=${vehicle.id}`}>
                <AlertTriangle />
                Record damage
              </Link>
            </Button>
            {canManage && (
              <Button variant="outline" asChild>
                <Link href={`/fleet/${vehicle.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Status</CardTitle>
              <StatusBadge visual={vehicleStatusConfig[vehicle.status]} />
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Gauge className="size-4" />
                {vehicle.mileageKm.toLocaleString()} km
              </div>
              {vehicle.branchName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="size-4" />
                  {vehicle.branchName}
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                <span className="capitalize">{vehicle.category}</span> · {vehicle.transmission} ·{" "}
                {vehicle.fuelType}
                {vehicle.seats ? ` · ${vehicle.seats} seats` : ""}
                {vehicle.color ? ` · ${vehicle.color}` : ""}
              </div>
              <div className="text-sm font-medium text-foreground">
                {formatMad(vehicle.dailyRateMad)}/day
                {vehicle.depositMad ? ` · ${formatMad(vehicle.depositMad)} deposit` : ""}
              </div>
            </CardContent>
          </Card>

          {vehicle.currentReservation && (
            <Card>
              <CardHeader>
                <CardTitle>Current reservation</CardTitle>
              </CardHeader>
              <CardContent>
                <ReservationRow booking={vehicle.currentReservation} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Upcoming reservations</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {vehicle.upcomingReservations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
              ) : (
                vehicle.upcomingReservations.map((b) => <ReservationRow key={b.id} booking={b} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent rentals</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {vehicle.recentReservations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed rentals yet.</p>
              ) : (
                vehicle.recentReservations.map((b) => <ReservationRow key={b.id} booking={b} />)
              )}
            </CardContent>
          </Card>

          {vehicle.recentInspections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent inspections</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {vehicle.recentInspections.map((inspection) => (
                  <Link
                    key={inspection.id}
                    href={`/inspections/${inspection.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:underline"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground capitalize">{inspection.type} inspection</span>
                      <span className="text-xs text-muted-foreground">
                        {inspection.odometerKm != null ? `${inspection.odometerKm.toLocaleString()} km` : "No odometer"}
                        {inspection.completedAt ? ` · ${formatDateTime(inspection.completedAt)}` : ""}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">{inspection.status}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {vehicle.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Files</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {vehicle.documents.map((doc) => (
                  <DocumentListItem key={doc.id} document={doc} canDelete={canManage} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <VehicleStatusActions vehicleId={vehicle.id} status={vehicle.status} />
              </CardContent>
            </Card>
          )}

          {vehicle.openDamages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Open damage</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {vehicle.openDamages.map((damage) => (
                  <Link
                    key={damage.id}
                    href={`/damages/${damage.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:underline"
                  >
                    <div className="flex flex-col">
                      <span className="text-foreground">{damage.vehicleArea}</span>
                      <span className="text-xs text-muted-foreground">{damage.description}</span>
                    </div>
                    <StatusBadge visual={damageStatusConfig[damage.status]} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {vehicle.previousDamages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Damage history</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {vehicle.previousDamages.map((damage) => (
                  <Link
                    key={damage.id}
                    href={`/damages/${damage.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:underline"
                  >
                    <span className="text-foreground">{damage.vehicleArea}</span>
                    <StatusBadge visual={damageStatusConfig[damage.status]} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Compliance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              <DocumentRow label="Insurance" date={vehicle.insuranceExpiresOn} nowMs={nowMs} />
              <Separator />
              <DocumentRow label="Registration" date={vehicle.registrationExpiresOn} nowMs={nowMs} />
              <Separator />
              <DocumentRow label="Inspection" date={vehicle.inspectionExpiresOn} nowMs={nowMs} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
