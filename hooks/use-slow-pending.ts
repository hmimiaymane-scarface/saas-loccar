"use client"

import { useEffect, useRef, useState } from "react"

const SLOW_THRESHOLD_MS = 6_000

/**
 * Roadmap phase 40 (Slow-Network Experience). The overwhelming majority
 * of this app's mutating forms already use `useActionState`'s own
 * `isPending` for a spinner (61 files, 136 call sites per the phase's
 * research pass) — rewriting all of them onto a new abstraction would
 * be exactly the kind of churn this codebase's own conventions warn
 * against. This hook is a thin wrapper around that existing `isPending`
 * boolean: it starts a timer the moment `isPending` flips true, and
 * flips `isSlow` true if it's *still* pending `SLOW_THRESHOLD_MS` later
 * — the signal a "still working, hang tight" message needs on top of
 * the spinner that's already there, so a slow connection reads as
 * "working" rather than "frozen." Never fires while idle or once
 * pending resolves either way.
 */
export function useSlowPending(isPending: boolean): boolean {
  const [isSlow, setIsSlow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!isPending) {
      // Resetting isSlow in sync with the caller's own isPending prop
      // flipping false, not derivable from any user event.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsSlow(false)
      clearTimeout(timerRef.current)
      return
    }

    timerRef.current = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_MS)
    return () => clearTimeout(timerRef.current)
  }, [isPending])

  return isSlow
}

export { SLOW_THRESHOLD_MS }
