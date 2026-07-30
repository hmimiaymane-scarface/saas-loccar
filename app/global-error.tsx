"use client"

import "./globals.css"
import { getErrorReference } from "@/lib/error-reference"

/**
 * Productization wave 1 phase 8 — the last-resort boundary, catching
 * anything that escapes even the root layout (see app/(dashboard)/error.tsx
 * for the far more common dashboard-segment case). Deliberately minimal
 * and dependency-light — this is what renders if something is already
 * badly wrong, so it can't lean on the rest of the app's component tree.
 * Must define its own <html>/<body> (Next.js requirement) and can't
 * export `metadata`.
 *
 * Roadmap phase 43 — same two gaps as the dashboard boundary, fixed the
 * same way but staying dependency-light: a plain `<a>` hard navigation
 * (not `next/link`/the router — this is the one place in the app where
 * even client-side routing itself might be what's broken) instead of a
 * "Go back" button, and `getErrorReference` (a pure, dependency-free
 * helper — no React/Supabase imports) for the support reference.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const reference = getErrorReference(error)

  return (
    <html lang="en">
      <body className="flex min-h-svh items-center justify-center bg-neutral-50 p-6 font-sans text-neutral-900">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-neutral-600">
            An unexpected error stopped the app from loading. Try again, or reload the page.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
            >
              Try again
            </button>
            <a href="/overview" className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900">
              Go to Overview
            </a>
          </div>
          <p className="text-xs text-neutral-500">
            If this keeps happening, share this reference with support: <span className="font-mono">{reference}</span>
          </p>
        </div>
      </body>
    </html>
  )
}
