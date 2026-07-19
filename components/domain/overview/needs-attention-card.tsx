"use client"

import Link from "next/link"
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react"
import { motion } from "motion/react"

import type { LiveAlert } from "@/types/rental"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const URGENCY_ICON = {
  due_soon: Clock,
  due_now: AlertTriangle,
  overdue: AlertTriangle,
}

const URGENCY_TONE: Record<LiveAlert["urgency"], string> = {
  due_soon: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  due_now: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  overdue: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
}

/**
 * The dashboard's action-first surface: what actually needs a decision
 * today, ranked most urgent first, each linking straight to where it gets
 * resolved. Deliberately not another statistics card — see the phase
 * brief's "prioritize actions instead of showing only statistics."
 */
function NeedsAttentionCard({ alerts }: { alerts: LiveAlert[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2.5 py-4 text-sm text-muted-foreground">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="flex size-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
            >
              <CheckCircle2 className="size-4" />
            </motion.div>
            All caught up — nothing needs your attention right now.
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {alerts.map((alert) => {
              const Icon = URGENCY_ICON[alert.urgency]
              return (
                <Link
                  key={alert.key}
                  href={alert.href}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", URGENCY_TONE[alert.urgency])}>
                    <Icon className="size-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{alert.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{alert.description}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { NeedsAttentionCard }
