/** Roadmap phase 58 — the fixed vocabulary of usage-telemetry event names
 * this app actually emits. The database column (usage_events.event_type)
 * is plain text, not a CHECK-constrained enum (see the migration's own
 * comment for why) — this union is where type safety for today's known
 * event names lives instead. Adding a new event: add it here, emit it
 * from the one place it happens, no migration needed.
 *
 * Naming convention: `<flow>_started` / `<flow>_step_viewed` /
 * `<flow>_completed` for the two funnels this phase measures
 * (new_rental, return) — platform_get_dropoff_summary derives the step
 * event's name directly from the flow name (`${flow}_step_viewed`), so
 * a new funnel-tracked flow must follow this exact pattern to be
 * queryable there.
 */
export type UsageEventType =
  | "new_rental_started"
  | "new_rental_step_viewed"
  | "new_rental_completed"
  | "return_started"
  | "return_step_viewed"
  | "return_completed"
  | "search_opened"
  | "search_query_run"
  | "search_result_selected"
  | "quick_action_used"
  | "alert_action_used"
  | "alert_dismissed"
  | "error_occurred"
  | "import_completed"
  | "pwa_install_outcome"
  | "pwa_installed"
