"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { toggleMigrationChecklistItem } from "@/app/platform/actions"
import { MIGRATION_CHECKLIST_STEPS, migrationChecklistProgress, type MigrationChecklistStepDef } from "@/lib/platform/migration-checklist"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import type { MigrationChecklistItem } from "@/types/platform"

/** Roadmap phase 49 (Founder-Assisted Migration Mode) — the platform
 * admin's tracker for one client's white-glove onboarding. See
 * docs/founder-assisted-migration.md for the recommended process each
 * step maps to. */
function MigrationChecklistPanel({ companyId, items }: { companyId: string; items: MigrationChecklistItem[] }) {
  const { done, total } = migrationChecklistProgress(items)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Migration checklist</CardTitle>
        <CardDescription>
          {done} of {total} steps complete — see docs/founder-assisted-migration.md for the recommended process.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {MIGRATION_CHECKLIST_STEPS.map((step) => (
          <ChecklistRow
            key={step.key}
            companyId={companyId}
            step={step}
            item={items.find((i) => i.stepKey === step.key)}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function ChecklistRow({
  companyId,
  step,
  item,
}: {
  companyId: string
  step: MigrationChecklistStepDef
  item: MigrationChecklistItem | undefined
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isDone = item?.isDone ?? false

  function toggle() {
    setError(null)
    startTransition(async () => {
      const result = await toggleMigrationChecklistItem(companyId, step.key, !isDone)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex items-start gap-3 px-6 py-3">
      <Checkbox checked={isDone} onChange={toggle} disabled={isPending} className="mt-0.5" />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className={cn("text-sm text-foreground", isDone && "line-through decoration-muted-foreground/50")}>
          {step.label}
        </span>
        <span className="text-xs text-muted-foreground">{step.description}</span>
        {isDone && item?.completedAt && (
          <span className="text-xs text-muted-foreground">
            Completed {formatRelativeTime(item.completedAt)}
            {item.completedByEmail ? ` · ${item.completedByEmail}` : ""}
          </span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
      {isPending && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
    </div>
  )
}

export { MigrationChecklistPanel }
