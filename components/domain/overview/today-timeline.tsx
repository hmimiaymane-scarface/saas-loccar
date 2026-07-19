"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowDownToLine, ArrowUpFromLine, PartyPopper } from "lucide-react"

import type { TodayTimelineEntry } from "@/types/rental"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

const DEFAULT_START_HOUR = 7
const DEFAULT_END_HOUR = 20

function hourOf(iso: string): number {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60
}

function DayProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? done / total : 1
  const radius = 16
  const circumference = 2 * Math.PI * radius

  return (
    <div className="relative flex size-10 shrink-0 items-center justify-center" role="img" aria-label={`${done} of ${total} done today`}>
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-muted" />
        <motion.circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          stroke="currentColor"
          className={total > 0 && done === total ? "text-emerald-500" : "text-primary"}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - pct) }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute text-[10px] font-medium text-foreground">
        {done}/{total}
      </span>
    </div>
  )
}

function EntryMarker({ entry, leftPct }: { entry: TodayTimelineEntry; leftPct: number }) {
  const Icon = entry.type === "pickup" ? ArrowUpFromLine : ArrowDownToLine
  const tone = entry.done
    ? "bg-muted text-muted-foreground"
    : entry.type === "pickup"
      ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
      : "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={{ left: `${leftPct}%` }}
          className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 focus-visible:outline-none"
          aria-label={`${entry.type === "pickup" ? "Pickup" : "Return"} for ${entry.customerName} at ${formatTime(entry.atIso)}${entry.done ? ", done" : ""}`}
        >
          <div className={cn("flex size-7 items-center justify-center rounded-full ring-4 ring-background", tone)}>
            <Icon className="size-3.5" />
          </div>
          <span className="text-[10px] font-medium text-muted-foreground">{formatTime(entry.atIso)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", tone)}>
              <Icon className="size-4" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium text-foreground">
                {entry.type === "pickup" ? "Pickup" : "Return"} · {formatTime(entry.atIso)}
              </span>
              <span className="text-xs text-muted-foreground">{entry.reference}</span>
            </div>
          </div>
          <p className="text-sm text-foreground">
            {entry.customerName}
            {entry.vehicleLabel ? ` — ${entry.vehicleLabel}` : ""}
          </p>
          {entry.done && <p className="text-xs text-emerald-600 dark:text-emerald-400">Already done.</p>}
          <Button asChild size="sm" variant="outline">
            <Link href={`/reservations?search=${encodeURIComponent(entry.reference)}`}>Open reservation</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A visual, at-a-glance replacement for a plain list of today's pickups
 * and returns — a horizontal line of the working day with each event as
 * a marker, plus a live "now" indicator and a small day-progress ring.
 * Every marker is a real focusable button with a full text description,
 * so nothing here depends on being able to see position or color. */
function TodayTimeline({ entries }: { entries: TodayTimelineEntry[] }) {
  const [nowHour, setNowHour] = useState<number | null>(null)

  useEffect(() => {
    const timeout = setTimeout(() => setNowHour(hourOf(new Date().toISOString())), 0)
    const id = setInterval(() => setNowHour(hourOf(new Date().toISOString())), 60000)
    return () => {
      clearTimeout(timeout)
      clearInterval(id)
    }
  }, [])

  const done = entries.filter((e) => e.done).length
  const total = entries.length

  const eventHours = entries.map((e) => hourOf(e.atIso))
  const startHour = Math.min(DEFAULT_START_HOUR, ...eventHours.map((h) => Math.floor(h) - 1))
  const endHour = Math.max(DEFAULT_END_HOUR, ...eventHours.map((h) => Math.ceil(h) + 1))
  const span = endHour - startHour

  const hourMarks = Array.from({ length: Math.floor(span / 3) + 1 }, (_, i) => startHour + i * 3).filter(
    (h) => h <= endHour
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today</CardTitle>
        {total > 0 && (
          <CardAction>
            <DayProgressRing done={done} total={total} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex items-center gap-2.5 py-2 text-sm text-muted-foreground">
            <PartyPopper className="size-4 text-muted-foreground" />
            No pickups or returns scheduled today.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="relative h-14">
              <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-border" />
              {nowHour !== null && nowHour >= startHour && nowHour <= endHour && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-400 dark:bg-red-500"
                  style={{ left: `${((nowHour - startHour) / span) * 100}%` }}
                  aria-hidden="true"
                />
              )}
              {entries.map((entry) => (
                <EntryMarker key={entry.id} entry={entry} leftPct={((hourOf(entry.atIso) - startHour) / span) * 100} />
              ))}
            </div>
            <div className="relative h-4 text-[10px] text-muted-foreground">
              {hourMarks.map((h) => (
                <span
                  key={h}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${((h - startHour) / span) * 100}%` }}
                >
                  {h % 24}:00
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { TodayTimeline }
