"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, BellRing } from "lucide-react"

import { runNotificationRemindersNowAction } from "@/app/(dashboard)/notifications/actions"
import { Button } from "@/components/ui/button"

/** Dev/manual trigger — the cron job (vercel.json, every 15 minutes)
 * is the real production path, but nothing about this feature should
 * require deploying to Vercel or waiting for the next tick to see it
 * work. Same pattern as operations-feed's own `RunObserversButton`. */
function RunRemindersButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null)
            const result = await runNotificationRemindersNowAction()
            if (result.error) {
              setMessage(result.error)
              return
            }
            setMessage(`Pushed ${result.summary?.pushed ?? 0} new reminder(s).`)
            router.refresh()
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <BellRing />}
        Run reminders now
      </Button>
      {message && <p className="max-w-sm text-right text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}

export { RunRemindersButton }
