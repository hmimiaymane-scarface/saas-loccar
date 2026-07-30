import type { Metadata } from "next"
import { Globe } from "lucide-react"

import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export const metadata: Metadata = { title: "Agency" }

/**
 * Roadmap phase 50 (Public Agency Page / Booking Request Funnel) —
 * deliberately NOT built yet, per explicit instruction: this route is
 * a placeholder marking where the feature would live, not a partial
 * implementation.
 *
 * The full brief, for whenever this is picked back up:
 * - A public, no-login page per company at /agency/[slug] (this
 *   route) — agency branding, vehicle catalog, availability
 *   indication, Contact/WhatsApp.
 * - A booking-request form on this page, writing to a new (not yet
 *   designed) public-facing request table/RPC — a public visitor has
 *   no session, so this needs its own narrow, rate-limited write path
 *   (likely a SECURITY DEFINER function scoped to inserts only, not
 *   the ordinary requireSession()/RLS-member pattern every other
 *   mutation in this app uses).
 * - The resulting request should surface in the owner's existing
 *   "Needs Attention"/Operations Feed (lib/operations-feed/) as a new
 *   observer type, with Accept/Modify/Reject actions.
 * - "Accept" should reuse the existing reservation-creation path
 *   (app/(dashboard)/reservations/actions.ts) so the request's fields
 *   map straight onto a real reservation with no retyping — that's the
 *   phase's own "done when" bar.
 * - `companies.slug` (types/rental.ts) already exists and is exactly
 *   what this route's [slug] param would resolve against — no new
 *   company-identifier concept needed.
 *
 * None of the above is implemented: no DB migration, no RPC, no
 * booking-request table, no feed observer, no accept/convert action.
 * This file exists solely so the route/folder is real and future work
 * has an obvious place to start.
 */
export default function PublicAgencyPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-muted/40 px-4 py-12">
      <div className="flex w-full max-w-md">
        <EmptyPlaceholder
          icon={Globe}
          title="This agency's booking page is coming soon"
          description="Public booking requests aren't available yet — please contact the agency directly."
        />
      </div>
    </div>
  )
}
