"use client"

import { useEffect, useRef } from "react"

/**
 * On step change (or any dependency change), focuses the first empty
 * required field inside the returned container ref, falling back to the
 * first focusable field if every required field is already filled.
 *
 * Only runs when `dep` changes — never on every keystroke — so it can't
 * fight the user while they're typing. Deferred one frame so it runs
 * after the new step's DOM has actually painted.
 */
export function useStepFocus<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    const frame = requestAnimationFrame(() => {
      const requiredFields = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input[required], select[required], textarea[required]"
      )
      for (const field of Array.from(requiredFields)) {
        if (field.disabled) continue
        if (!field.value) {
          field.focus()
          return
        }
      }
      const firstField = container.querySelector<HTMLElement>(
        "input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
      )
      firstField?.focus()
    })

    return () => cancelAnimationFrame(frame)
  }, [dep])

  return ref
}
