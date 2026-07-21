import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Phone, Mail, MapPin, CalendarClock, ClipboardList, FileText, Plus, Sparkles, Car } from "lucide-react"

import { getSessionContext, type SessionContext } from "@/lib/auth/session"
import { getCustomerDetail, getCustomerTimeline } from "@/lib/data"
import { formatDate, formatMad, initials } from "@/lib/format"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { getCustomerIntelligence } from "@/lib/customer-intelligence-store"
import { assessReturningCustomerReadiness } from "@/lib/customer-readiness"
import { computeFavoriteVehicles } from "@/lib/customer-favorites"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { ReservationListItem } from "@/components/domain/reservations/reservation-list-item"
import { DocumentListItem } from "@/components/domain/documents/document-list-item"
import { CustomerEditForm } from "@/components/domain/customers/customer-edit-form"
import { CustomerStatusControl } from "@/components/domain/customers/customer-status-control"
import { CustomerIntelligenceCard } from "@/components/domain/customers/customer-intelligence-card"
import { CustomerReadinessCard } from "@/components/domain/customers/customer-readiness-card"
import { EntityTimeline } from "@/components/domain/intelligence/entity-timeline"

// Bible Chapter 3 §6 also lists "Communication history" — omitted here
// rather than faked: this codebase has no messaging/comms concept
// anywhere yet (no channel, no log). A future phase, not this one —
// same restraint docs/customer-intelligence.md already applied to
// trust score's missing "communication reliability" factor.

/** Same degrade-to-null convention as the vehicle detail page's
 * loadVehicleIntelligence — skipped entirely in mock mode, and any
 * other failure (migration not applied yet) hides the card instead of
 * crashing an otherwise-working page. */
async function loadCustomerIntelligence(session: SessionContext, customerId: string) {
  if (!isSupabaseConfigured) return null
  try {
    const supabase = await createClient()
    return await getCustomerIntelligence(supabase, session, customerId)
  } catch {
    return null
  }
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/overview")

  const { id } = await params
  const customer = await getCustomerDetail(session.company.id, id)
  if (!customer) notFound()

  const [intelligence, timeline] = await Promise.all([
    loadCustomerIntelligence(session, id),
    getCustomerTimeline(session.company.id, id, 1, 20),
  ])

  const canEdit = ["owner", "manager", "agent"].includes(session.role)
  const canResolveStatus = session.role === "owner" || session.role === "manager"
  const canDeleteDocs = session.role === "owner" || session.role === "manager"
  const licenseExpired = customer.licenseExpiresAt ? new Date(customer.licenseExpiresAt) < new Date() : false

  const readiness = assessReturningCustomerReadiness({
    licenseExpiresAt: customer.licenseExpiresAt || null,
    documents: customer.documents,
  })
  const identityDocument = customer.documents.find((d) => d.category === "identity_document")
  const favoriteVehicles = computeFavoriteVehicles(customer.reservations)

  return (
    <>
      <SectionHeader
        title={customer.fullName}
        description={`Customer since ${formatDate(customer.customerSince)} · ${customer.reservations.length} reservation${customer.reservations.length === 1 ? "" : "s"} on file`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/reservations/new?customerId=${customer.id}`}>
                <Plus />
                Start rental
              </Link>
            </Button>
            {canEdit && <CustomerEditForm customer={customer} />}
          </div>
        }
      />

      {/* Bible requirement: customer profiles are "relationship
          dashboards, not contact cards" — the AI summary leads the
          page for the same reason the vehicle page's does. */}
      {intelligence?.summary && (
        <div className="flex items-center gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-foreground">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" />
          {intelligence.summary}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {customer.activeRental && (
            <Card className="border-emerald-300 dark:border-emerald-500/40">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <CalendarClock className="size-4 text-emerald-600 dark:text-emerald-400" />
                  Currently on an active rental
                </div>
                <Link href={`/reservations/${customer.activeRental.id}`} className="text-sm text-primary hover:underline">
                  {customer.activeRental.reference}
                </Link>
              </CardContent>
            </Card>
          )}

          {intelligence && <CustomerIntelligenceCard intelligence={intelligence} />}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <EntityTimeline items={timeline.items} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reservation history</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.reservations.length === 0 ? (
                <EmptyPlaceholder
                  icon={ClipboardList}
                  title="No reservations yet"
                  description="Reservations for this customer will appear here."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {customer.reservations.map((booking) => (
                    <ReservationListItem key={booking.id} booking={booking} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {favoriteVehicles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Favorite vehicles</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {favoriteVehicles.map((v) => (
                  <div key={v.vehicleId} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                        <Car className="size-4 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{v.vehicleLabel}</span>
                        <span className="text-xs text-muted-foreground">{v.plate}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{v.rentalCount} rentals</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.documents.length === 0 ? (
                <EmptyPlaceholder
                  icon={FileText}
                  title="No documents uploaded"
                  description="ID, licence and other files for this customer will appear here."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {customer.documents.map((doc) => (
                    <DocumentListItem key={doc.id} document={doc} canDelete={canDeleteDocs} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <CustomerReadinessCard
            companyId={session.company.id}
            customerId={customer.id}
            readiness={readiness}
            identityDocument={identityDocument}
          />

          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{initials(customer.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{customer.fullName}</span>
                  {customer.nationality && <span className="text-xs text-muted-foreground">{customer.nationality}</span>}
                </div>
              </div>
              <Separator />
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2.5">
                  <Phone className="size-4 text-muted-foreground" />
                  <span className="text-foreground">{customer.phone}</span>
                </div>
                {customer.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="text-foreground">{customer.email}</span>
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-center gap-2.5">
                    <MapPin className="size-4 text-muted-foreground" />
                    <span className="text-foreground">{customer.address}</span>
                  </div>
                )}
              </div>
              <Separator />
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Licence number</span>
                  <span className="text-foreground">{customer.licenseNumber || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Licence expires</span>
                  <span className={licenseExpired ? "text-red-600 dark:text-red-400" : "text-foreground"}>
                    {customer.licenseExpiresAt ? formatDate(customer.licenseExpiresAt) : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID document</span>
                  <span className="text-foreground">{customer.idDocumentNumber || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Marketing consent</span>
                  <span className="text-foreground">{customer.marketingConsent ? "Yes" : "No"}</span>
                </div>
              </div>
              {customer.notes && (
                <>
                  <Separator />
                  <p className="text-xs whitespace-pre-wrap text-muted-foreground">{customer.notes}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Balance</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Outstanding</span>
              <span className="font-medium text-foreground">{formatMad(customer.outstandingBalanceMad)}</span>
            </CardContent>
          </Card>

          {canResolveStatus && (
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <CustomerStatusControl customerId={customer.id} status={customer.status} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
