"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { undoImportBatch } from "@/app/(dashboard)/import/actions"
import { useSubmitGuard } from "@/hooks/use-submit-guard"
import type { ImportBatchSummary } from "@/lib/data"
import { formatRelativeTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

/** Roadmap phase 48 — one row per recent, not-yet-fully-undone import
 * batch, each with its own Undo button. Renders nothing when there are
 * no batches (a fresh company, or everything already undone) rather
 * than an empty-state card — the wizard below is the actual point of
 * this page. */
function RecentImports({ batches }: { batches: ImportBatchSummary[] }) {
  if (batches.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent imports</CardTitle>
        <CardDescription>Undo removes what this import added. Rows already in use (like a vehicle with a reservation) are skipped and can be retried later.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {batches.map((batch) => (
          <ImportBatchRow key={batch.id} batch={batch} />
        ))}
      </CardContent>
    </Card>
  )
}

function ImportBatchRow({ batch }: { batch: ImportBatchSummary }) {
  const router = useRouter()
  const { status, error, run } = useSubmitGuard()
  const [result, setResult] = useState<{ removedCount: number; remainingCount: number; fullyUndone: boolean } | null>(null)

  function handleUndo() {
    run(async () => {
      const outcome = await undoImportBatch(batch.id)
      if (outcome.error) return { error: outcome.error }
      setResult({
        removedCount: outcome.removedCount ?? 0,
        remainingCount: outcome.remainingCount ?? 0,
        fullyUndone: outcome.fullyUndone ?? false,
      })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">
            {batch.rowCount} {batch.entityType === "vehicle" ? "vehicle" : "customer"}
            {batch.rowCount === 1 ? "" : "s"} imported
          </p>
          <p className="text-xs text-muted-foreground">
            {formatRelativeTime(batch.createdAt)}
            {batch.errorCount > 0 ? ` · ${batch.errorCount} row(s) failed at the time` : ""}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleUndo} disabled={status === "pending" || status === "slow" || result?.fullyUndone}>
          {status === "pending" || status === "slow" ? "Undoing…" : "Undo"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && !result.fullyUndone && (
        <p className="text-xs text-muted-foreground">
          Removed {result.removedCount} of {result.removedCount + result.remainingCount} — {result.remainingCount} row(s) are now in use elsewhere and couldn&apos;t be removed. Try again later.
        </p>
      )}
    </div>
  )
}

export { RecentImports }
