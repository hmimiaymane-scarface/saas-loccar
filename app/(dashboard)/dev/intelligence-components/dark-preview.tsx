"use client"

import { useState } from "react"
import { Moon, Sun } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/** Local-only dark-mode preview for this page — the app has no theme
 * provider or toggle anywhere yet (dark: CSS exists throughout, but
 * nothing ever applies a .dark class to <html>, so it's currently
 * unreachable). This scopes .dark to a wrapper div here only, so both
 * themes can actually be seen without building app-wide theme switching
 * as a side effect of this phase. */
function DarkPreview({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false)

  return (
    <div className={cn(dark && "dark")}>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setDark((d) => !d)}>
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {dark ? "Light preview" : "Dark preview"}
        </Button>
      </div>
      <div className="rounded-4xl bg-background p-6 text-foreground">{children}</div>
    </div>
  )
}

export { DarkPreview }
