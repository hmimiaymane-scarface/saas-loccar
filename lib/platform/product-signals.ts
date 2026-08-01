/**
 * Roadmap phase 64 (Pilot Feedback Loop) — the fixed vocabulary of
 * observable pilot-owner behavior a founder logs while running a
 * pilot, per that phase's own brief. Pure, no Supabase dependency —
 * `key` here is the single source of truth mirrored by the
 * `product_signals` table's `signal_type` CHECK constraint
 * (`supabase/migrations/20260818090000_phase64_product_signals.sql`);
 * if either side's list changes, both must change together.
 *
 * `howToObserve` is deliberately part of this data, not left to the
 * founder's memory — half of these can never be instrumented in-app
 * (paper, WhatsApp, a verbal ask) and are only ever caught by paying
 * attention during a call or site visit; the other half already have a
 * real, existing analytics signal to cross-reference (see
 * docs/pilot-feedback-loop.md for the full mapping to specific
 * usage_events).
 */

export interface ProductSignalTypeDef {
  key: string
  label: string
  howToObserve: string
}

export const PRODUCT_SIGNAL_TYPES: ProductSignalTypeDef[] = [
  {
    key: "avoids",
    label: "What they avoid",
    howToObserve: "A feature they never open despite it being relevant — cross-check against usage_events for that flow's own *_step_viewed/*_started counts.",
  },
  {
    key: "misunderstands",
    label: "What they misunderstand",
    howToObserve: "A question that reveals a wrong mental model of what a screen does — only caught by listening during a call, not instrumentable.",
  },
  {
    key: "repeats",
    label: "What they repeat",
    howToObserve: "The same manual step every single day — cross-check against usage_events for a high-frequency event with a low completion rate right after it.",
  },
  {
    key: "paper_workaround",
    label: "What they still do on paper",
    howToObserve: "A physical notebook/printout still in use alongside RentalOS — only caught by asking directly or seeing it on a visit, not instrumentable.",
  },
  {
    key: "whatsapp_workaround",
    label: "What they still do on WhatsApp outside RentalOS",
    howToObserve: "A customer conversation, reminder, or confirmation still happening in their own WhatsApp instead of this app's WhatsApp integration — only caught by asking, not instrumentable.",
  },
  {
    key: "asked_us_to_do",
    label: "What they ask you to do for them",
    howToObserve: "A task they hand back to the founder instead of doing themselves in the app — every instance is itself the signal; log it the moment it happens.",
  },
  {
    key: "hesitates",
    label: "Where they hesitate",
    howToObserve: "A visible pause or a 'wait, what does this do?' moment — cross-check against usage_events funnel drop-off (a *_step_viewed with no matching *_completed soon after).",
  },
  {
    key: "enjoys",
    label: "Which screens they enjoy checking",
    howToObserve: "A screen they open unprompted, or mention liking — this app has no generic page-view tracking (usage_events is named-event-only, see docs/product-analytics.md), so this one is manual-observation-only today.",
  },
]

/** Impact x frequency, both 1-3 — the whole ranking this phase's brief
 * asks for ("ranked product changes, not a random request list") comes
 * from sorting on this single number, descending. */
export function productSignalPriority(impact: number, frequency: number): number {
  return impact * frequency
}
