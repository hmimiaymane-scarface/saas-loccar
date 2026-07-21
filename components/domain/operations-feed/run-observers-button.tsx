"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, RefreshCw } from "lucide-react"

import { runObserversNowAction } from "@/app/(dashboard)/operations-feed/actions"
import { Button } from "@/components/ui/button"

/** Dev/manual trigger — the cron job (vercel.json, daily) is the real
 * production path, but nothing about this feature should require
 * deploying to Vercel or waiting a day to see it work. */
function RunObserversButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null)
            const result = await runObserversNowAction()
            if (result.error) {
              setMessage(result.error)
              return
            }
            setMessage(`Detected ${result.summary?.detected ?? 0} conditions — ${result.summary?.opened ?? 0} new, ${result.summary?.resolved ?? 0} resolved.`)
            router.refresh()
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Run observers now
      </Button>
      {message && <p className="max-w-sm text-right text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}

export { RunObserversButton }
