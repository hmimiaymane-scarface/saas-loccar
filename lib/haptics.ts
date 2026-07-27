/**
 * Productization wave 1 phase 9 — a tiny, feature-detected wrapper over
 * the Vibration API, for the handful of one-handed mobile interactions
 * where a physical tap confirmation is worth more than a visual one
 * alone (a toggle flip, opening the quick-actions sheet). Same
 * feature-detection convention `components/pwa/install-prompt.tsx`
 * already uses for `beforeinstallprompt` — check for the API, no-op
 * silently if it isn't there, never throw.
 *
 * **Honest limitation**: iOS Safari (and so every iOS PWA, installed or
 * not) has never implemented the Vibration API at all — `"vibrate" in
 * navigator` is simply `false` there. This silently does nothing on a
 * large share of real devices; it's a nice-to-have confirmation on the
 * platforms that support it (Android Chrome and most Android PWA
 * contexts), not something any interaction should ever depend on for
 * correctness or feedback the user actually needs to notice.
 */

export type HapticPattern = "light" | "success" | "warning"

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  success: 15,
  warning: [15, 60, 15],
}

export function vibrate(pattern: HapticPattern): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return
  navigator.vibrate(PATTERNS[pattern])
}
