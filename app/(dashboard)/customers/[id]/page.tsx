import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Phone, Mail, MapPin, CalendarClock, ClipboardList, FileText } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getCustomerDetail } from "@/lib/data"
import { formatDate, formatMad, initials } from "@/lib/format"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { ReservationListItem } from "@/components/domain/reservations/reservation-list-item"
import { DocumentListItem } from "@/components/domain/documents/document-list-item"
import { CustomerEditForm } from "@/components/domain/customers/customer-edit-form"
import { CustomerStatusControl } from "@/components/domain/customers/customer-status-control"

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

  const canEdit = ["owner", "manager", "agent"].includes(session.role)
  const canResolveStatus = session.role === "owner" || session.role === "manager"
  const canDeleteDocs = session.role === "owner" || session.role === "manager"
  const licenseExpired = customer.licenseExpiresAt ? new Date(customer.licenseExpiresAt) < new Date() : false

  return (
    <>
      <SectionHeader
        title={customer.fullName}
        description={`${customer.reservations.length} reservation${customer.reservations.length === 1 ? "" : "s"} on file`}
        actions={canEdit ? <CustomerEditForm customer={customer} /> : undefined}
      />

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
