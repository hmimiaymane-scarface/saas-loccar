"use client"

import { useEffect, useRef, useState } from "react"
import { animate } from "motion/react"

import { formatMad } from "@/lib/format"

/** Named formatters only (never a raw function prop) — a function can't
 * cross the Server-to-Client Component boundary, and this is always
 * rendered from a Server Component parent via StatCard. */
const FORMATTERS = {
  mad: formatMad,
  integer: (n: number) => Math.round(n).toLocaleString("en-GB"),
  percent: (n: number) => `${Math.round(n)}%`,
} as const

/** Counts up to `value` on mount/change instead of just appearing —
 * a small, purely decorative touch (no data implication either way,
 * screen readers get the final formatted value immediately via
 * aria-hidden + a plain text fallback). Respects reduced-motion. */
function AnimatedNumber({ value, formatter }: { value: number; formatter: keyof typeof FORMATTERS }) {
  const format = FORMATTERS[formatter]
  const [display, setDisplay] = useState(value)
  const prevValue = useRef(value)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReducedMotion) {
      const from = prevValue.current
      prevValue.current = value
      if (value === from) return
      const timeout = setTimeout(() => setDisplay(value), 0)
      return () => clearTimeout(timeout)
    }
    const controls = animate(prevValue.current, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    })
    prevValue.current = value
    return () => controls.stop()
  }, [value])

  return (
    <span>
      <span aria-hidden="true">{format(display)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}

export { AnimatedNumber }
