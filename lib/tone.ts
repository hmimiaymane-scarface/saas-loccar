/**
 * Shared color/tone vocabulary for AI-derived values (confidence levels,
 * health/trust/profitability scores, insight priority) — the equivalent
 * of lib/status.ts's Record<Enum, StatusVisual> for continuous or derived
 * values rather than a fixed domain enum. Same 4-class color idiom used
 * everywhere else in the app (bg-{c}-50 text-{c}-700
 * dark:bg-{c}-500/10 dark:text-{c}-400), so a confidence badge or a score
 * bar never looks like it belongs to a different design system.
 */

export type Tone = "positive" | "warning" | "critical" | "neutral"

interface ToneClasses {
  badge: string
  text: string
  icon: string
  /** Solid fill color, for things like a progress bar indicator. */
  fill: string
}

export const toneClasses: Record<Tone, ToneClasses> = {
  positive: {
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: "text-emerald-500",
    fill: "bg-emerald-500",
  },
  warning: {
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    text: "text-amber-700 dark:text-amber-400",
    icon: "text-amber-500",
    fill: "bg-amber-500",
  },
  critical: {
    badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    text: "text-red-700 dark:text-red-400",
    icon: "text-red-500",
    fill: "bg-red-500",
  },
  neutral: {
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
    text: "text-muted-foreground",
    icon: "text-muted-foreground",
    fill: "bg-zinc-400",
  },
}

/** High confidence should read as unobtrusive; low confidence should
 * invite review — see the bible's Chapter 5 §5 ("Confidence Scores").
 * Narrower than Tone: a confidence level is never "neutral". */
export function confidenceTier(percent: number): "positive" | "warning" | "critical" {
  if (percent >= 90) return "positive"
  if (percent >= 70) return "warning"
  return "critical"
}

/** The bible's own vocabulary for a 0-100 health/trust/profitability
 * score (Chapter 3 §5, Chapter 10 §7): Healthy / Needs Attention /
 * Critical. */
export function scoreBand(value: number): { tone: Tone; label: string } {
  if (value >= 70) return { tone: "positive", label: "Healthy" }
  if (value >= 40) return { tone: "warning", label: "Needs Attention" }
  return { tone: "critical", label: "Critical" }
}
