import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, Inbox } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getCalendarReservations, getCalendarMaintenanceBlocks, getVehicles } from "@/lib/data"
import { startOfWeek, addDays, toDateKey, parseDateKey } from "@/lib/calendar-dates"
import { formatDate, formatMad } from "@/lib/format"
import { SectionHeader } from "@/components/domain/section-header"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { CalendarNav } from "@/components/domain/calendar/calendar-nav"
import { FleetTimeline } from "@/components/domain/calendar/fleet-timeline"
import { DayAgenda } from "@/components/domain/calendar/day-agenda"

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const params = await searchParams
  const anchor = params.week ? parseDateKey(params.week) : new Date()
  const weekStart = startOfWeek(anchor)
  const weekEnd = addDays(weekStart, 7)

  const companyId = session.company.id
  const [vehicles, bookings, maintenanceBlocks] = await Promise.all([
    getVehicles(companyId),
    getCalendarReservations(companyId, { startDate: toDateKey(weekStart), endDate: toDateKey(weekEnd) }),
    getCalendarMaintenanceBlocks(companyId, { startDate: toDateKey(weekStart), endDate: addDays(weekStart, 6).toISOString().slice(0, 10) }),
  ])

  const unassigned = bookings.filter((b) => !b.vehicle)
  const assigned = bookings.filter((b) => b.vehicle)

  const weekLabel = `${formatDate(toDateKey(weekStart))} – ${formatDate(toDateKey(addDays(weekStart, 6)))}`
  const canCreate = ["owner", "manager", "agent"].includes(session.role)

  return (
    <>
      <SectionHeader
        title="Calendar"
        description="Pickups, returns and fleet occupancy for the week"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/reservations">View all reservations</Link>
            </Button>
            {canCreate && (
              <Button asChild>
                <Link href="/reservations/new">
                  <Plus />
                  New reservation
                </Link>
              </Button>
            )}
          </>
        }
      />

      <CalendarNav weekKey={toDateKey(weekStart)} label={weekLabel} />

      {unassigned.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Unassigned requests this week</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {unassigned.map((b) => (
              <Link
                key={b.id}
                href={`/reservations/${b.id}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                    <Inbox className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">{b.customer.fullName}</span>
                    <span className="text-xs text-muted-foreground">
                      {b.requestedCategory ?? "any"} · {formatDate(b.startDate)} – {formatDate(b.endDate)}
                    </span>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">{formatMad(b.payment.totalDueMad)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <FleetTimeline vehicles={vehicles} bookings={assigned} maintenanceBlocks={maintenanceBlocks} weekStart={weekStart} />
      <DayAgenda bookings={bookings} maintenanceBlocks={maintenanceBlocks} weekStart={weekStart} />
    </>
  )
}
