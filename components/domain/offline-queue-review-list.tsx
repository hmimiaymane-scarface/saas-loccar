"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Clock, Trash2 } from "lucide-react"

import { listMutations, removeMutation, type QueuedMutation, type MutationType } from "@/lib/offline/db"
import { formatRelativeTime } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const TYPE_LABELS: Record<MutationType, string> = {
  saveInspectionFields: "Inspection fields",
  attachInspectionMedia: "Inspection photo",
  completeInspection: "Inspection completion",
  createDamage: "Damage record",
  createDocumentRecord: "Document",
  addContractSignature: "Contract signature",
}

/** Best-effort link back to where this was captured, derived from
 * whatever id the mutation's own payload happens to carry — not every
 * mutation type carries the same ids, so this is a plain fallback
 * chain rather than a per-type switch. Returns null (no link, just the
 * type label and error) rather than guessing. */
function resolveLink(mutation: QueuedMutation): string | null {
  const payload = mutation.payload as Record<string, unknown>
  if (typeof payload.reservationId === "string") return `/reservations/${payload.reservationId}`
  if (typeof payload.inspectionId === "string") return `/inspections/${payload.inspectionId}`
  if (typeof payload.contractId === "string") return `/contracts/${payload.contractId}`
  if (typeof payload.customerId === "string") return `/customers/${payload.customerId}`
  if (typeof payload.vehicleId === "string") return `/fleet/${payload.vehicleId}`
  return null
}

function MutationRow({ mutation, onDiscard }: { mutation: QueuedMutation; onDiscard: (id: string) => void }) {
  const href = resolveLink(mutation)
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{TYPE_LABELS[mutation.type]}</span>
        <span className="text-xs text-muted-foreground">Queued {formatRelativeTime(mutation.createdAt)}</span>
        {mutation.errorMessage && <span className="text-xs text-destructive">{mutation.errorMessage}</span>}
        {href && (
          <Link href={href} className="text-xs font-medium text-primary underline underline-offset-2">
            Go to where this was captured
          </Link>
        )}
      </div>
      {mutation.status === "needs_review" && (
        <Button type="button" size="sm" variant="ghost" onClick={() => onDiscard(mutation.id)}>
          <Trash2 className="size-3.5" />
          Discard
        </Button>
      )}
    </div>
  )
}

/**
 * Roadmap phase 39 — the review surface sync.ts's own doc comment has
 * always promised ("never silently dropped... a human looks at it")
 * but nothing ever actually rendered before this phase. Reads
 * lib/offline/db.ts directly (the same IndexedDB the offline-queue
 * hook already reads) rather than going through useOfflineQueue, since
 * this needs the full mutation list, not just counts.
 *
 * No per-mutation "retry in place" action — the wizards that captured
 * this data are already the right place to redo the underlying action;
 * this page's job is visibility and letting a human discard an item
 * they've already resolved outside the queue (e.g. re-took the photo
 * directly on the reservation page).
 */
function OfflineQueueReviewList() {
  const [mutations, setMutations] = useState<QueuedMutation[] | null>(null)

  const refresh = useCallback(async () => {
    setMutations(await listMutations())
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading IndexedDB can only happen after mount (SSR has no indexedDB); no user event exists to move this into instead, same reasoning use-offline-queue.ts's own navigator.onLine read already uses.
    void refresh()
  }, [refresh])

  async function discard(id: string) {
    await removeMutation(id)
    await refresh()
  }

  if (mutations === null) return null

  if (mutations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nothing queued on this device — everything captured here has synced.
        </CardContent>
      </Card>
    )
  }

  const needsReview = mutations.filter((m) => m.status === "needs_review")
  const pending = mutations.filter((m) => m.status !== "needs_review")

  return (
    <div className="flex flex-col gap-4">
      {needsReview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              Needs your attention ({needsReview.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {needsReview.map((m) => (
              <MutationRow key={m.id} mutation={m} onDiscard={discard} />
            ))}
          </CardContent>
        </Card>
      )}
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-muted-foreground" />
              Still syncing ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pending.map((m) => (
              <MutationRow key={m.id} mutation={m} onDiscard={discard} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export { OfflineQueueReviewList }
