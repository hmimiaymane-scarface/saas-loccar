"use client"

import "./globals.css"

/**
 * Productization wave 1 phase 8 — the last-resort boundary, catching
 * anything that escapes even the root layout (see app/(dashboard)/error.tsx
 * for the far more common dashboard-segment case). Deliberately minimal
 * and dependency-light — this is what renders if something is already
 * badly wrong, so it can't lean on the rest of the app's component tree.
 * Must define its own <html>/<body> (Next.js requirement) and can't
 * export `metadata`.
 */
export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="en">
      <body className="flex min-h-svh items-center justify-center bg-neutral-50 p-6 font-sans text-neutral-900">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-neutral-600">
            An unexpected error stopped the app from loading. Try again, or reload the page.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="mt-2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
