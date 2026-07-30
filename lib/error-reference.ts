/**
 * Roadmap phase 43 (Error Recovery and Resilience) — "support/debug
 * reference internally" for every important-action failure. No
 * error-tracking service exists in this app (no Sentry/APM dependency
 * — checked `package.json`; adding one is a real, separate
 * infrastructure decision, out of this phase's scope). This is the
 * honest, dependency-free middle ground: prefer Next.js's own
 * `error.digest` (populated in production, correlates what the user
 * sees with the actual server log entry without leaking the raw
 * message to the client) and fall back to a short, locally-derived
 * reference when no digest exists (dev mode, or a pure client-side
 * render error) — so there is always something concrete a user can
 * read out to support instead of "it just broke," never a silent gap.
 */
export function getErrorReference(error: { digest?: string; message?: string }): string {
  if (error.digest) return error.digest

  // Minute-granularity time bucket so the same error recurring within
  // the same minute produces the same reference — lets a human match
  // two reports of "the same" failure without a real tracking service.
  const basis = `${error.message ?? "unknown"}:${Math.floor(Date.now() / 60_000)}`
  let hash = 0
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 31 + basis.charCodeAt(i)) | 0
  }
  return `local-${Math.abs(hash).toString(36)}`
}
