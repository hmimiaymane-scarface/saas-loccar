"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { SLOW_THRESHOLD_MS } from "@/hooks/use-slow-pending"

const SAVED_PULSE_MS = 1_800

export type SubmitStatus = "idle" | "pending" | "slow" | "saved" | "error"

type SubmitResult = { error?: string } | void

interface UseSubmitGuardResult {
  status: SubmitStatus
  error: string | null
  /** No-ops if a call is already in flight — the actual double-submit
   * guard, not just a disabled button (which a slow render frame can
   * momentarily miss). */
  run: (action: () => Promise<SubmitResult>) => void
  /** Re-runs the last action passed to `run`. Only meaningful once
   * `status === "error"`; a no-op otherwise. */
  retry: () => void
}

/**
 * Roadmap phase 40 (Slow-Network Experience). For actions that aren't
 * a native form submission — a dismiss button, a toggle switch, a
 * wizard's async "Continue" check — there's no `useActionState` to
 * lean on the way `useSlowPending` does for real forms. This is the
 * equivalent for that imperative case: idle -> pending -> (slow if it
 * runs past `SLOW_THRESHOLD_MS`) -> saved (briefly) or error, with the
 * in-flight guard living in a ref so a rapid double-click can't start
 * a second call while the first is still running.
 */
export function useSubmitGuard(): UseSubmitGuardResult {
  const [status, setStatus] = useState<SubmitStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  const runningRef = useRef(false)
  const lastActionRef = useRef<(() => Promise<SubmitResult>) | null>(null)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mountedRef = useRef(true)

  useEffect(
    () => () => {
      mountedRef.current = false
      clearTimeout(slowTimerRef.current)
      clearTimeout(savedTimerRef.current)
    },
    []
  )

  const run = useCallback((action: () => Promise<SubmitResult>) => {
    if (runningRef.current) return
    runningRef.current = true
    lastActionRef.current = action

    clearTimeout(savedTimerRef.current)
    setError(null)
    setStatus("pending")
    slowTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setStatus("slow")
    }, SLOW_THRESHOLD_MS)

    action()
      .then((result) => {
        clearTimeout(slowTimerRef.current)
        runningRef.current = false
        if (!mountedRef.current) return

        if (result && "error" in result && result.error) {
          setError(result.error)
          setStatus("error")
          return
        }

        setStatus("saved")
        savedTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setStatus("idle")
        }, SAVED_PULSE_MS)
      })
      .catch((err: unknown) => {
        clearTimeout(slowTimerRef.current)
        runningRef.current = false
        if (!mountedRef.current) return
        setError(err instanceof Error ? err.message : "Something went wrong.")
        setStatus("error")
      })
  }, [])

  const retry = useCallback(() => {
    if (lastActionRef.current) run(lastActionRef.current)
  }, [run])

  return { status, error, run, retry }
}
