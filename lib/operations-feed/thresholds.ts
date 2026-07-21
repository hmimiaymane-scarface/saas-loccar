/**
 * Roadmap phase 12 — every observer threshold in one place, named and
 * justified, same convention as `lib/customer-matching.ts`'s
 * `DUPLICATE_SURFACE_THRESHOLD`/`DUPLICATE_LIKELY_THRESHOLD`. These are
 * judgment calls, not owner-configurable settings — two thresholds
 * this phase genuinely needs (document expiry window, maintenance
 * reminder window) already exist as real per-company Settings fields
 * from before this phase and are reused as-is, not duplicated here.
 */

/** A full week with zero pickup/return activity is long enough to
 * meaningfully hurt utilization for a small-to-mid rental fleet —
 * the bible's own canonical example is 11 days; 7 catches it earlier
 * without being trigger-happy on a vehicle that just came back
 * yesterday. */
export const IDLE_VEHICLE_THRESHOLD_DAYS = 7
/** Past this many days idle, "worth knowing about" becomes "someone
 * should actively find this vehicle a booking today." */
export const IDLE_VEHICLE_CRITICAL_MULTIPLIER = 2

/** An inspection left in `draft` this long means a handoff is stuck
 * mid-process — a customer or vehicle in limbo, not just a busy
 * agent who'll finish the form in ten minutes. */
export const STALE_INSPECTION_HOURS = 4

/** The two photo categories requirement 1 explicitly names ("missing
 * fuel/mileage photos") — matches the exact slot keys
 * `components/domain/pickup/pickup-wizard.tsx` and
 * `components/domain/returns/return-wizard.tsx` already use
 * (`media.caption`), not a new taxonomy. */
export const REQUIRED_HANDOFF_PHOTO_SLOTS = ["fuel_gauge", "dashboard_odometer"] as const

/** A customer counts as "high past value" for the inactive-customer
 * observer once they've generated this much lifetime revenue — high
 * enough that losing them quietly would be a real, not marginal,
 * loss. Same order of magnitude as a single multi-day SUV rental. */
export const INACTIVE_CUSTOMER_MIN_LIFETIME_REVENUE_MAD = 5000
/** How long since their last rental before "inactive" applies —
 * reuses `lib/customer-segments.ts#getInactiveCustomers`'s own
 * parameter, given the same value here for consistency. */
export const INACTIVE_CUSTOMER_MONTHS = 6

/** A category needs at least this many priced reservations before its
 * average means anything — flagging "unusual" against a sample of two
 * would just be noise dressed up as a statistic. */
export const PRICING_MIN_CATEGORY_SAMPLE_SIZE = 5
/** A daily rate this far below (or above) its category's recent
 * average is worth a second look — not every discount, just the ones
 * large enough that "was this a mistake?" is a reasonable question. */
export const PRICING_DEVIATION_THRESHOLD_PERCENT = 30
