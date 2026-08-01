"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

function CalendarNav({ weekKey, label }: { weekKey: string; label: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function goTo(nextWeek: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("week", nextWeek)
    router.push(`${pathname}?${params.toString()}`)
  }

  function shift(days: number) {
    const d = new Date(weekKey)
    d.setDate(d.getDate() + days)
    goTo(d.toISOString().slice(0, 10))
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon-sm" onClick={() => shift(-7)} aria-label="Previous week">
        <ChevronLeft className="size-4 rtl:-scale-x-100" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => goTo(new Date().toISOString().slice(0, 10))}>
        Today
      </Button>
      <Button variant="outline" size="icon-sm" onClick={() => shift(7)} aria-label="Next week">
        <ChevronRight className="size-4 rtl:-scale-x-100" />
      </Button>
      <span className="ms-1 text-sm font-medium text-foreground">{label}</span>
    </div>
  )
}

export { CalendarNav }
