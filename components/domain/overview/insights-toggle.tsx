"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Collapsible } from "@/components/ui/collapsible"

/**
 * Roadmap phase 65 (Remove Before Adding) — the bible's original
 * 5-level Overview hierarchy (phase 13) rendered every tier
 * unconditionally, every day, whether or not there was anything to
 * act on in tiers 3 (Business Health) and 5 (Historical Analysis) —
 * neither is daily-operations content the way tiers 1-2 (Needs
 * Attention, Today's Operations) are. Collapsed by default: every
 * card underneath is unchanged and one tap away, not removed or moved
 * to a different page — this is a visibility default, not a
 * capability cut.
 */
function InsightsToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "Hide business health & history" : "Show business health & history"}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </Button>
      <Collapsible open={open}>
        <div className="flex flex-col gap-4">{children}</div>
      </Collapsible>
    </div>
  )
}

export { InsightsToggle }
