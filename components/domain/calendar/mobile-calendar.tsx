"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { ArrowUpRight, ArrowDownLeft, Car, Wrench, Plus, CalendarCheck } from "lucide-react"

import type { Booking, Vehicle } from "@/types/rental"
import type { MaintenanceBlock } from "@/lib/data"
import { toDateKey } from "@/lib/calendar-dates"
import {
  groupBookingsByDate,
  groupBookingsByVehicle,
  groupMaintenanceByDate,
  groupMaintenanceByVehicle,
  type DayBookings,
} from "@/lib/calendar-grouping"
import { bookingStatusConfig, overdueVisual } from "@/lib/status"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/domain/status-badge"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

type Mode = "today" | "week" | "vehicle"

interface MobileCalendarProps {
  vehicles: Vehicle[]
  bookings: Booking[]
  maintenanceBlocks: MaintenanceBlock[]
  weekStart: Date
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const SWIPE_THRESHOLD_PX = 60

/**
 * Productization wave 2 phase 17 — "the calendar works comfortably
 * one-handed." Replaces `DayAgenda` with 3 real modes and 3 things
 * that didn't exist anywhere in this app before: swipe navigation (no
 * gesture-handling code existed in this repo at all), a tap-to-book
 * empty slot (`?vehicleId=`/`?pickup=` were already fully supported by
 * `/reservations/new`, just never linked to from a calendar's empty
 * cells), and a tap-reservation-for-a-summary-first step, reusing the
 * exact `Popover` pattern `FleetVisualGrid`/`TodayTimeline` already
 * established elsewhere in this app rather than jumping straight to
 * the full detail page.
 */
function useSwipeNavigation(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const startX = useRef<number | null>(null)

  return {
    onTouchStart(e: React.TouchEvent) {
      startX.current = e.touches[0].clientX
    },
    onTouchEnd(e: React.TouchEvent) {
      if (startX.current === null) return
      const deltaX = e.changedTouches[0].clientX - startX.current
      startX.current = null
      if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return
      if (deltaX < 0) onSwipeLeft()
      else onSwipeRight()
    },
  }
}

function MobileCalendar({ vehicles, bookings, maintenanceBlocks, weekStart }: MobileCalendarProps) {
  const [mode, setMode] = useState<Mode>("today")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function shiftWeek(days: number) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + days)
    const params = new URLSearchParams(searchParams.toString())
    params.set("week", toDateKey(d))
    router.push(`${pathname}?${params.toString()}`)
  }

  const swipeHandlers = useSwipeNavigation(
    () => shiftWeek(7),
    () => shiftWeek(-7)
  )

  const today = toDateKey(new Date())

  // Roadmap phase 41 — grouping is independent of `mode`/`weekStart`,
  // so it shouldn't redo an O(vehicles × bookings) (or O(days ×
  // bookings)) scan on every mode switch or swipe. `bookings`/
  // `maintenanceBlocks` only change reference on a real data refetch
  // (a fresh page load), so these memoize across all of that.
  const bookingsByDate = useMemo(() => groupBookingsByDate(bookings), [bookings])
  const maintenanceByDate = useMemo(() => groupMaintenanceByDate(maintenanceBlocks), [maintenanceBlocks])
  const bookingsByVehicle = useMemo(() => groupBookingsByVehicle(bookings), [bookings])
  const maintenanceByVehicle = useMemo(() => groupMaintenanceByVehicle(maintenanceBlocks), [maintenanceBlocks])

  return (
    <div className="flex flex-col gap-3 lg:hidden">
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted p-1">
        {(["today", "week", "vehicle"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex h-11 items-center justify-center rounded-xl text-sm font-medium capitalize transition-colors",
              mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {m === "vehicle" ? "Availability" : m}
          </button>
        ))}
      </div>

      {mode === "today" && (
        <TodayMode bookingsByDate={bookingsByDate} maintenanceByDate={maintenanceByDate} today={today} />
      )}
      {mode === "week" && (
        <div {...swipeHandlers}>
          <WeekMode bookingsByDate={bookingsByDate} maintenanceByDate={maintenanceByDate} weekStart={weekStart} today={today} />
        </div>
      )}
      {mode === "vehicle" && (
        <div {...swipeHandlers}>
          <VehicleMode
            vehicles={vehicles}
            bookingsByVehicle={bookingsByVehicle}
            maintenanceByVehicle={maintenanceByVehicle}
            weekStart={weekStart}
          />
        </div>
      )}
    </div>
  )
}

function BookingSummaryPopover({ booking, children }: { booking: Booking; children: React.ReactNode }) {
  const visual = booking.isOverdue ? overdueVisual : bookingStatusConfig[booking.status]
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{booking.customer.fullName}</span>
            <StatusBadge visual={visual} />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Car className="size-3.5" />
            {booking.vehicle ? `${booking.vehicle.make} ${booking.vehicle.model}` : "Unassigned"}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(booking.startDate)} – {formatDate(booking.endDate)}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/reservations/${booking.id}`}>View reservation</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MaintenanceSummaryPopover({ block, children }: { block: MaintenanceBlock; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">{block.title}</span>
          <p className="text-xs text-muted-foreground">{block.vehicleLabel}</p>
          <p className="text-xs text-muted-foreground">Scheduled {formatDate(block.date)}</p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/maintenance/${block.id}`}>Open maintenance record</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DayRows({ dayBookings, dayMaintenance, dateKey }: { dayBookings: { booking: Booking; label: string }[]; dayMaintenance: MaintenanceBlock[]; dateKey: string }) {
  const isEmpty = dayBookings.length === 0 && dayMaintenance.length === 0

  if (isEmpty) {
    return (
      <Button asChild variant="outline" size="sm" className="h-11 w-full justify-start gap-2 text-muted-foreground">
        <Link href={`/reservations/new?pickup=${dateKey}`}>
          <Plus className="size-4" />
          Book a rental
        </Link>
      </Button>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {dayBookings.map(({ booking, label }) => (
        <BookingSummaryPopover key={`${label}-${booking.id}`} booking={booking}>
          <button type="button" className="flex min-h-11 w-full items-center gap-2.5 py-2 text-left">
            {label === "Pickup" ? (
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ArrowDownLeft className="size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm text-foreground">
                {label} · {booking.customer.fullName}
              </span>
              <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Car className="size-3" />
                {booking.vehicle ? `${booking.vehicle.make} ${booking.vehicle.model}` : "Unassigned"}
              </span>
            </div>
            <StatusBadge visual={booking.isOverdue ? overdueVisual : bookingStatusConfig[booking.status]} />
          </button>
        </BookingSummaryPopover>
      ))}
      {dayMaintenance.map((block) => (
        <MaintenanceSummaryPopover key={block.id} block={block}>
          <button type="button" className="flex min-h-11 w-full items-center gap-2.5 py-2 text-left">
            <Wrench className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-foreground">
              {block.title} · {block.vehicleLabel}
            </span>
          </button>
        </MaintenanceSummaryPopover>
      ))}
    </div>
  )
}

function dayContent(bookingsByDate: Map<string, DayBookings>, maintenanceByDate: Map<string, MaintenanceBlock[]>, dateKey: string) {
  const forDate = bookingsByDate.get(dateKey)
  const dayBookings = [
    ...(forDate?.pickups ?? []).map((booking) => ({ booking, label: "Pickup" })),
    ...(forDate?.returns ?? []).map((booking) => ({ booking, label: "Return" })),
  ]
  const dayMaintenance = maintenanceByDate.get(dateKey) ?? []
  return { dayBookings, dayMaintenance }
}

function TodayMode({
  bookingsByDate,
  maintenanceByDate,
  today,
}: {
  bookingsByDate: Map<string, DayBookings>
  maintenanceByDate: Map<string, MaintenanceBlock[]>
  today: string
}) {
  const { dayBookings, dayMaintenance } = dayContent(bookingsByDate, maintenanceByDate, today)

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <CalendarCheck className="size-4" />
          Today, {formatDate(today)}
        </p>
        <DayRows dayBookings={dayBookings} dayMaintenance={dayMaintenance} dateKey={today} />
      </CardContent>
    </Card>
  )
}

function WeekMode({
  bookingsByDate,
  maintenanceByDate,
  weekStart,
  today,
}: {
  bookingsByDate: Map<string, DayBookings>
  maintenanceByDate: Map<string, MaintenanceBlock[]>
  weekStart: Date
  today: string
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="flex flex-col gap-3">
      {days.map((day) => {
        const key = toDateKey(day)
        const isToday = key === today
        const { dayBookings, dayMaintenance } = dayContent(bookingsByDate, maintenanceByDate, key)

        return (
          <Card key={key}>
            <CardContent className="flex flex-col gap-2.5">
              <p className={cn("text-sm font-medium", isToday ? "text-primary" : "text-foreground")}>
                {day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
              </p>
              <DayRows dayBookings={dayBookings} dayMaintenance={dayMaintenance} dateKey={key} />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

const SEGMENT_TONE = {
  available: "bg-muted",
  booked: "bg-blue-500",
  overdue: "bg-red-500",
  maintenance: "bg-amber-500",
} as const

function VehicleMode({
  vehicles,
  bookingsByVehicle,
  maintenanceByVehicle,
  weekStart,
}: {
  vehicles: Vehicle[]
  bookingsByVehicle: Map<string, Booking[]>
  maintenanceByVehicle: Map<string, MaintenanceBlock[]>
  weekStart: Date
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  if (vehicles.length === 0) {
    return (
      <EmptyPlaceholder
        icon={Car}
        title="Add your first vehicle to see it here"
        description="Availability shows every vehicle's week at a glance, once your fleet has at least one."
        action={{ label: "Add vehicle", href: "/fleet/new" }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex px-1 text-[10px] font-medium text-muted-foreground">
        <span className="flex-1" />
        {DAY_LABELS.map((label) => (
          <span key={label} className="flex-1 text-center">
            {label}
          </span>
        ))}
      </div>
      {vehicles.map((vehicle) => {
        const vehicleBookings = bookingsByVehicle.get(vehicle.id) ?? []
        const vehicleMaintenance = maintenanceByVehicle.get(vehicle.id) ?? []

        return (
          <Card key={vehicle.id}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-col">
                <p className="truncate text-sm font-medium text-foreground">
                  {vehicle.make} {vehicle.model}
                </p>
                <p className="truncate text-xs text-muted-foreground">{vehicle.plate}</p>
              </div>
              <div className="flex gap-1">
                {days.map((day) => {
                  const key = toDateKey(day)
                  const maintenance = vehicleMaintenance.find((m) => m.date === key)
                  const booking = vehicleBookings.find((b) => b.startDate <= key && b.endDate >= key)

                  const tone = maintenance ? "maintenance" : booking ? (booking.isOverdue ? "overdue" : "booked") : "available"

                  const segment = (
                    <button
                      type="button"
                      aria-label={`${vehicle.make} ${vehicle.model} on ${key}: ${tone}`}
                      className={cn("h-11 flex-1 rounded-md transition-opacity active:opacity-70", SEGMENT_TONE[tone])}
                    />
                  )

                  if (maintenance) {
                    return (
                      <MaintenanceSummaryPopover key={key} block={maintenance}>
                        {segment}
                      </MaintenanceSummaryPopover>
                    )
                  }
                  if (booking) {
                    return (
                      <BookingSummaryPopover key={key} booking={booking}>
                        {segment}
                      </BookingSummaryPopover>
                    )
                  }
                  return (
                    <Link key={key} href={`/reservations/new?vehicleId=${vehicle.id}&pickup=${key}`} className="flex-1">
                      {segment}
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export { MobileCalendar }
