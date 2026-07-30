import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Pencil, UserRound, Car, MapPin, Clock, ClipboardCheck, Undo2, GitCompare, Phone } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getReservationDetail, getFleetCardContext } from "@/lib/data"
import { createClient } from "@/lib/supabase/server"
import { getContractsForReservation, getContractReadiness, type ContractReadiness } from "@/lib/contracts/template-store"
import { isSupabaseConfigured } from "@/lib/env"
import { formatMad, formatDateTime } from "@/lib/format"
import { formatInTimeZone } from "@/lib/timezone"
import { bookingStatusConfig, overdueVisual, paymentStatusConfig, damageStatusConfig } from "@/lib/status"
import { isTerminalStatus, isEditableStatus } from "@/lib/reservations/status"
import {
  buildConfirmationMessage,
  buildPickupReminderMessage,
  buildReturnReminderMessage,
  buildPaymentReminderMessage,
} from "@/lib/whatsapp-messages"
import { StatusBadge } from "@/components/domain/status-badge"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { WhatsAppButton } from "@/components/domain/whatsapp-button"
import { ReservationStatusActions } from "@/components/domain/reservations/reservation-status-actions"
import { DocumentListItem } from "@/components/domain/documents/document-list-item"
import { DepositPanel } from "@/components/domain/reservations/deposit-panel"
import { GenerateContractButton } from "@/components/domain/contracts/generate-contract-button"
import { RentalStartedBanner } from "@/components/domain/reservations/rental-started-banner"
import { ReturnCompletedBanner } from "@/components/domain/reservations/return-completed-banner"
import { ReturnCompletionSummary } from "@/components/domain/reservations/return-completion-summary"
import { ContractStatusBadge } from "@/components/domain/contracts/contract-status-badge"
import { ContractReadinessBadge } from "@/components/domain/contracts/contract-readiness-badge"
import type { SessionContext } from "@/lib/auth/session"

/** Same degrade-to-empty convention as every other AI/advisory feature
 * on this page's peers (fleet/[id], customers/[id]) — mock mode has no
 * Supabase client to query contracts through. */
async function loadContracts(companyId: string, reservationId: string) {
  if (!isSupabaseConfigured) return []
  try {
    const supabase = await createClient()
    return await getContractsForReservation(supabase, companyId, reservationId)
  } catch {
    return []
  }
}

/** Only called when no contract exists yet (see call site) — once one
 * has been generated, its own lifecycle status is the relevant signal,
 * not pre-generation readiness. Same degrade-to-null convention as
 * `loadContracts` above. */
async function loadContractReadiness(session: SessionContext, reservationId: string): Promise<ContractReadiness | null> {
  if (!isSupabaseConfigured) return null
  try {
    const supabase = await createClient()
    return await getContractReadiness(supabase, session, reservationId)
  } catch {
    return null
  }
}

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
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ justActivated?: string; justCompleted?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const { id } = await params
  const query = await searchParams
  // Roadmap phase 41 — `loadContracts` only needs `id`/`companyId`, not
  // the reservation row itself, so it doesn't need to wait for
  // `getReservationDetail` to resolve first. Was a real, avoidable
  // sequential round trip before this phase's performance audit.
  const [reservation, contracts] = await Promise.all([
    getReservationDetail(session.company.id, id),
    loadContracts(session.company.id, id),
  ])
  if (!reservation) notFound()

  const contractReadiness = contracts.length === 0 ? await loadContractReadiness(session, id) : null

  const showReturnCompletedBanner = query.justCompleted === "1" && reservation.status === "completed"
  const nextReservation =
    showReturnCompletedBanner && reservation.vehicle
      ? ((await getFleetCardContext(session.company.id, [reservation.vehicle.id]))[reservation.vehicle.id]?.nextReservation ?? null)
      : null

  const tz = session.company.timezone
  const canManage = ["owner", "manager", "agent"].includes(session.role)
  const canEdit = canManage && isEditableStatus(reservation.status)

  return (
    <>
      <SectionHeader
        title={reservation.reference}
        description={`Created ${formatInTimeZone(reservation.createdAt, tz, { day: "numeric", month: "short", year: "numeric" })}${reservation.createdByName ? ` by ${reservation.createdByName}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge visual={reservation.isOverdue ? overdueVisual : bookingStatusConfig[reservation.status]} />
            {canManage && ["request", "pending", "confirmed"].includes(reservation.status) && (
              <Button asChild>
                <Link href={`/reservations/${reservation.id}/pickup`}>
                  <ClipboardCheck />
                  Prepare pickup
                </Link>
              </Button>
            )}
            {canManage && reservation.status === "active" && (
              <Button asChild>
                <Link href={`/reservations/${reservation.id}/return`}>
                  <Undo2 />
                  Manage return
                </Link>
              </Button>
            )}
            {reservation.pickupInspection && (
              <Button variant="outline" asChild>
                <Link href={`/reservations/${reservation.id}/comparison`}>
                  <GitCompare />
                  Compare pickup/return
                </Link>
              </Button>
            )}
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

      {query.justActivated === "1" && reservation.status === "active" && (
        <RentalStartedBanner reservation={reservation} timezone={tz} hasContract={contracts.length > 0} />
      )}

      {showReturnCompletedBanner && (
        <>
          <ReturnCompletedBanner reservation={reservation} timezone={tz} nextReservation={nextReservation} />
          <ReturnCompletionSummary reservation={reservation} />
        </>
      )}

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
              {canManage && (
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`tel:${reservation.customer.phone}`}>
                      <Phone />
                      Call
                    </a>
                  </Button>
                  {["request", "pending", "confirmed"].includes(reservation.status) && (
                    <WhatsAppButton
                      phone={reservation.customer.phone}
                      label="Send confirmation"
                      size="sm"
                      message={buildConfirmationMessage({
                        customerName: reservation.customer.fullName,
                        reference: reservation.reference,
                        vehicleLabel: reservation.vehicle ? `${reservation.vehicle.make} ${reservation.vehicle.model}` : null,
                        pickupAtIso: reservation.pickupAt,
                        pickupLocation: reservation.pickupLocation,
                        timezone: tz,
                      })}
                    />
                  )}
                  {["pending", "confirmed"].includes(reservation.status) && (
                    <WhatsAppButton
                      phone={reservation.customer.phone}
                      label="Pickup reminder"
                      size="sm"
                      message={buildPickupReminderMessage({
                        customerName: reservation.customer.fullName,
                        reference: reservation.reference,
                        pickupAtIso: reservation.pickupAt,
                        pickupLocation: reservation.pickupLocation,
                        timezone: tz,
                      })}
                    />
                  )}
                  {reservation.status === "active" && (
                    <WhatsAppButton
                      phone={reservation.customer.phone}
                      label="Return reminder"
                      size="sm"
                      message={buildReturnReminderMessage({
                        customerName: reservation.customer.fullName,
                        reference: reservation.reference,
                        returnAtIso: reservation.returnAt,
                        returnLocation: reservation.returnLocation,
                        timezone: tz,
                      })}
                    />
                  )}
                </div>
              )}
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
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment status</span>
                <StatusBadge visual={paymentStatusConfig[reservation.payment.status]} />
              </div>
              {canManage && reservation.payment.remainingMad > 0 && (
                <div className="pt-1">
                  <WhatsAppButton
                    phone={reservation.customer.phone}
                    label="Payment reminder"
                    size="sm"
                    message={buildPaymentReminderMessage({
                      customerName: reservation.customer.fullName,
                      reference: reservation.reference,
                      remainingMad: reservation.payment.remainingMad,
                    })}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {(reservation.pickupInspection || reservation.returnInspection) && (
            <Card>
              <CardHeader>
                <CardTitle>Inspections</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {[reservation.pickupInspection, reservation.returnInspection]
                  .filter((i) => i !== null)
                  .map((inspection) => (
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
                      <StatusBadge
                        visual={
                          inspection.status === "completed"
                            ? { label: "Completed", icon: ClipboardCheck, dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" }
                            : { label: "Draft", icon: Clock, dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" }
                        }
                      />
                    </Link>
                  ))}
              </CardContent>
            </Card>
          )}

          {reservation.damages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Damages</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {reservation.damages.map((damage) => (
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

          {canManage && (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Contract</CardTitle>
                <GenerateContractButton reservationId={reservation.id} />
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {contracts.length > 0 ? (
                  <div className="flex flex-col divide-y divide-border">
                    {contracts.map((c) => (
                      <Link
                        key={c.id}
                        href={`/contracts/${c.id}`}
                        className="flex items-center justify-between py-2.5 text-sm hover:underline"
                      >
                        <span className="text-foreground">Generated {formatDateTime(c.generatedAt)}</span>
                        <div className="flex items-center gap-2">
                          {c.generatedByName && <span className="text-xs text-muted-foreground">{c.generatedByName}</span>}
                          <ContractStatusBadge status={c.status} />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  contractReadiness && <ContractReadinessBadge ready={contractReadiness.ready} issues={contractReadiness.issues} />
                )}
              </CardContent>
            </Card>
          )}

          {reservation.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {reservation.documents.map((doc) => (
                  <DocumentListItem key={doc.id} document={doc} canDelete={session.role === "owner" || session.role === "manager"} />
                ))}
              </CardContent>
            </Card>
          )}

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

          {!isTerminalStatus(reservation.status) && (
            <Card>
              <CardHeader>
                <CardTitle>Deposit</CardTitle>
              </CardHeader>
              <CardContent>
                <DepositPanel
                  reservationId={reservation.id}
                  deposit={reservation.deposit}
                  canCollect={["owner", "manager", "agent", "accountant"].includes(session.role)}
                  canResolve={session.role === "owner" || session.role === "manager"}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
