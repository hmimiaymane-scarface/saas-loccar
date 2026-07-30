"use client"

import { useEffect, useRef } from "react"

import { writeDraft } from "@/lib/draft-storage"

const DEFAULT_DEBOUNCE_MS = 500

/**
 * Roadmap phase 43. Debounced auto-save of `value` under `key` — pass
 * `enabled: false` once the draft's real submission has succeeded (or
 * there's nothing meaningful to save yet) so a stale draft doesn't
 * keep being rewritten after the user has already moved on. Pair with
 * `readDraft` (`@/lib/draft-storage`) called once at mount to seed the
 * caller's own `useState` initial values.
 */
export function useSaveDraft<T>(key: string, value: Partial<T>, enabled = true, debounceMs = DEFAULT_DEBOUNCE_MS): void {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const serialized = JSON.stringify(value)

  useEffect(() => {
    if (!enabled) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => writeDraft(key, value), debounceMs)
    return () => clearTimeout(timerRef.current)
    // Keyed on `serialized` (a stable string) rather than `value` (a
    // fresh object reconstructed by the caller every render) on purpose.
  }, [key, enabled, debounceMs, serialized]) // eslint-disable-line react-hooks/exhaustive-deps
}
