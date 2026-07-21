"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { enqueueMutation, countPendingMutations, countNeedsReviewMutations, type MutationType } from "@/lib/offline/db"
import { syncOfflineMutations } from "@/lib/offline/sync"

/**
 * Roadmap phase 16 — the field-workflow-facing half of the offline
 * queue. `enqueue` always writes to IndexedDB first regardless of
 * connectivity (see lib/offline/sync.ts's own doc comment for why:
 * queue-then-drain-immediately behaves identically whether the
 * network was ever actually down or not), then opportunistically
 * tries to sync right away — so on a normal connection nothing ever
 * visibly "waits," and the exact same code path handles a genuinely
 * offline device.
 *
 * Syncs are triggered by: mount, the browser's `online` event, and a
 * conservative 30s fallback interval while anything is still pending
 * (covers the real-world case of a connection that LOOKS online per
 * `navigator.onLine` but individual requests keep failing — cheap
 * insurance, not aggressive polling).
 */
export function useOfflineQueue(companyId: string) {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [needsReviewCount, setNeedsReviewCount] = useState(0)
  const syncingRef = useRef(false)

  const refreshCounts = useCallback(async () => {
    setPendingCount(await countPendingMutations())
    setNeedsReviewCount(await countNeedsReviewMutations())
  }, [])

  const sync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    try {
      await syncOfflineMutations(companyId)
    } finally {
      syncingRef.current = false
      await refreshCounts()
    }
  }, [companyId, refreshCounts])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading navigator.onLine can only happen after mount (SSR has no `navigator`); no user event exists to move this into instead.
    setIsOnline(navigator.onLine)
    void refreshCounts()
    void sync()

    function onOnline() {
      setIsOnline(true)
      void sync()
    }
    function onOffline() {
      setIsOnline(false)
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  useEffect(() => {
    if (pendingCount === 0) return
    const interval = setInterval(() => void sync(), 30_000)
    return () => clearInterval(interval)
  }, [pendingCount, sync])

  const enqueue = useCallback(
    async (
      type: MutationType,
      payload: Record<string, unknown>,
      options?: { dependsOn?: string[]; file?: { blob: Blob; fileName: string; mimeType: string } }
    ) => {
      const id = await enqueueMutation(type, payload, options)
      await refreshCounts()
      void sync()
      return id
    },
    [refreshCounts, sync]
  )

  return { isOnline, pendingCount, needsReviewCount, enqueue, syncNow: sync }
}
