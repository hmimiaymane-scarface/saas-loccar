import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Pencil, UserRound, Car, MapPin, Clock } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getReservationDetail } from "@/lib/data"
import { formatMad } from "@/lib/format"
import { formatInTimeZone } from "@/lib/timezone"
import { bookingStatusConfig, overdueVisual, paymentStatusConfig } from "@/lib/status"
import { isTerminalStatus } from "@/lib/reservations/status"
import { StatusBadge } from "@/components/domain/status-badge"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { ReservationStatusActions } from "@/components/domain/reservations/reservation-status-actions"

const SOURCE_LABELS: Record<string, string> = {
  walk_in: "Walk-in",
  phone: "Phone",
  whatsapp: "WhatsApp",
  website: "Website",
  partner: "Partner",
  other: "Other",
}

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const { id } = await params
  const reservation = await getReservationDetail(session.company.id, id)
  if (!reservation) notFound()

  const tz = session.company.timezone
  const canManage = ["owner", "manager", "agent"].includes(session.role)
  const canEdit = canManage && !isTerminalStatus(reservation.status)

  return (
    <>
      <SectionHeader
        title={reservation.reference}
        description={`Created ${formatInTimeZone(reservation.createdAt, tz, { day: "numeric", month: "short", year: "numeric" })}${reservation.createdByName ? ` by ${reservation.createdByName}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge visual={reservation.isOverdue ? overdueVisual : bookingStatusConfig[reservation.status]} />
            {canEdit && (
              <Button variant="outline" asChild>
                <Link href={`/reservations/${reservation.id}/edit`}>
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
            <CardHeader>
              <CardTitle>Rental</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-2.5">
                <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <p className="text-sm font-medium text-foreground">{reservation.customer.fullName}</p>
                  <p className="text-xs text-muted-foreground">{reservation.customer.phone}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Car className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  {reservation.vehicle ? (
                    <>
                      <p className="text-sm font-medium text-foreground">
                        {reservation.vehicle.make} {reservation.vehicle.model}
                      </p>
                      <p className="text-xs text-muted-foreground">{reservation.vehicle.plate}</p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-foreground">
                      Unassigned · {reservation.requestedCategory ?? "any"} requested
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <p className="text-sm text-foreground">
                    Pickup: {formatInTimeZone(reservation.pickupAt, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-sm text-foreground">
                    Return: {formatInTimeZone(reservation.returnAt, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-muted-foreground">{reservation.numDays} day{reservation.numDays === 1 ? "" : "s"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <p className="text-sm text-foreground">{reservation.pickupLocation || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    Return to {reservation.returnLocation || "—"}
                    {reservation.branchName ? ` · ${reservation.branchName}` : ""}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>
                  {reservation.numDays} day{reservation.numDays === 1 ? "" : "s"} × {formatMad(reservation.dailyRateMad)}
                </span>
                <span>{formatMad(reservation.dailyRateMad * reservation.numDays)}</span>
              </div>
              {reservation.discountMad > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span>-{formatMad(reservation.discountMad)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between font-medium text-foreground">
                <span>Total</span>
                <span>{formatMad(reservation.payment.totalDueMad)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Paid</span>
                <span>{formatMad(reservation.payment.amountPaidMad)}</span>
              </div>
              <div className="flex justify-between font-medium text-foreground">
                <span>Remaining</span>
                <span>{formatMad(reservation.payment.remainingMad)}</span>
              </div>
              {reservation.depositMad != null && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Deposit</span>
                  <span>{formatMad(reservation.depositMad)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment status</span>
                <StatusBadge visual={paymentStatusConfig[reservation.payment.status]} />
              </div>
            </CardContent>
          </Card>

          {reservation.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-wrap">{reservation.notes}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {reservation.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                reservation.activity.map((item) => (
                  <div key={item.id} className="flex flex-col gap-0.5 text-sm">
                    <p className="text-foreground">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatInTimeZone(item.timestamp, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {item.actor ? ` · ${item.actor}` : ""}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <ReservationStatusActions reservationId={reservation.id} status={reservation.status} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="text-foreground">{SOURCE_LABELS[reservation.source] ?? reservation.source}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created by</span>
                <span className="text-foreground">{reservation.createdByName ?? "—"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
