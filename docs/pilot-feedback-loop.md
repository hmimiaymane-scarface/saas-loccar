# Pilot Feedback Loop

Roadmap phase 64, directly after phase 63 (Pilot Onboarding Package).
Brief: "use real owner behavior to guide the final product" — track
what a pilot avoids, misunderstands, repeats, still does on paper,
still does on WhatsApp outside RentalOS, asks the founder to do for
them, hesitates on, and enjoys checking. "Done when: feedback is
converted into ranked product changes, not a random request list."

## What this phase actually builds

Not a survey, not an NPS score — a place to log a real, specific
observation the moment it happens (during a call, a WhatsApp thread, a
site visit), and a ranked view that turns a pile of observations into
"do these first," automatically, by sorting on one number.

**Honest framing up front**: half of the eight signals named in the
brief (what they misunderstand, what they still do on paper, what they
still do on WhatsApp, what they ask the founder to do) can never be
instrumented in-app — they happen entirely outside RentalOS, or are a
judgment call about a person's mental model that only a human
conversation reveals. This phase doesn't pretend otherwise. The other
half (avoids, repeats, hesitates, enjoys) have a *partial* existing
analytics signal worth cross-referencing (see the table below), but
still need a human to actually interpret what the numbers mean for one
specific pilot. **This is a founder's field-notes tool with a ranking
engine attached, not an automated behavior-detection system** — see
`lib/platform/product-signals.ts`'s own `howToObserve` field for the
per-signal detail.

| Signal | How it's actually caught |
|---|---|
| What they avoid | Mostly manual — notice a relevant feature they never open; cross-check against that flow's `usage_events` `*_step_viewed`/`*_started` counts if one exists. |
| What they misunderstand | Manual only — a question during a call that reveals a wrong mental model. |
| What they repeat | Manual, with a cross-check — a high-frequency `usage_events` entry with a low completion rate right after it is a hint, not proof. |
| What they still do on paper | Manual only — ask directly, or see it on a visit. |
| What they still do on WhatsApp outside RentalOS | Manual only — ask directly. |
| What they ask you to do for them | The signal *is* the moment it happens — log it right then. |
| Where they hesitate | Manual, with a cross-check — `usage_events`' own funnel drop-off data (a `*_step_viewed` with no matching `*_completed` soon after, see `docs/product-analytics.md`) already surfaces this partially at `/platform/analytics`. |
| Which screens they enjoy checking | Manual only today — this app has no generic page-view tracking (`usage_events` is named-business-event-only by design, not a page-view log), so there's no existing signal to cross-reference yet. |

## How it works

1. **Log the observation the moment it happens** — on
   `/platform/companies/[id]`, the new "Product signals" card: pick the
   signal type, rate impact (1-3) and frequency (1-3), write what was
   actually seen or heard. No batching notes into a spreadsheet later
   and losing the specifics — log it live, during or right after the
   call.
2. **The ranking is automatic, not a judgment call at review time** —
   priority = impact × frequency, computed by
   `platform_get_product_signals()` itself (never stored redundantly,
   so it can't drift). A significant-and-frequent issue (3×3=9) always
   outranks a minor-and-rare one (1×1=1) and, just as importantly, a
   significant-but-rare one (3×1=3) and a minor-but-constant one
   (1×3=3) rank identically — the score doesn't secretly favor either
   axis.
3. **Review the ranked list across every pilot** at
   `/platform/product-signals` — highest priority first, filterable by
   status. This is the literal "ranked product changes, not a random
   request list" the brief asks for.
4. **Move each signal through a real disposition** as it gets acted on:
   `open` → `planned` (picked up by a future phase) → `shipped` (built),
   or `declined` (a conscious no, not silently dropped). This is what
   turns a raw observation into an actual tracked product decision
   instead of a note that quietly goes stale.

## Why this shape, not something else

**Separate table from `pilot_feedback` (phase 63), not an extension of
it.** `pilot_feedback` is the pilot's own words, submitted by them,
never readable by the company that wrote it — insert-allowed,
read-only-via-RPC, the `usage_events`/`operational_events` shape.
`product_signals` is the *founder's* own field observation about a
pilot — the founder is the only party on either side of it, so it
follows the `company_subscriptions`/`platform_admins` shape instead:
RLS enabled, **zero policies at all**, every read and write through a
`security definer` function
(`supabase/migrations/20260818090000_phase64_product_signals.sql`).
Conflating the two would blur "what the customer told us" with "what
we noticed about the customer," which are genuinely different kinds of
evidence and shouldn't share a confidence level.

**A 1-3 scale on two axes, not a single 1-10 severity number.**
Impact and frequency are different questions ("does this matter" vs.
"does this come up") that a single number would hide — a
once-only-but-severe issue and a constant-but-trivial one both need
attention, for different reasons, and a blended score would make one
invisible next to the other. Multiplying (rather than adding) makes a
signal that's weak on *either* axis rank clearly below one that's
strong on both, which is the actual decision-making behavior wanted
here.

**No separate "product change" entity.** A signal's own `status` field
(`open`/`planned`/`shipped`/`declined`) already tracks the thing the
brief calls a "ranked product change" — inventing a second, linked
entity ("this signal produced change #4") would be structure without a
second thing to structure, at single-pilot scale. Worth revisiting if
a future phase needs one signal to map to multiple, independently
tracked changes, or one change to resolve several signals at once.

## Deliberately not built

- **No automated behavior detection** — every signal is founder-logged,
  not inferred from analytics. Building real anomaly/pattern detection
  on top of `usage_events` would be a substantial, separate project,
  disproportionate to a single-pilot-stage feedback loop.
- **No generic page-view tracking**, so "which screens they enjoy
  checking" stays manual-observation-only — adding one would be a
  meaningful architecture change to `lib/analytics/track.ts`'s
  deliberately named-event-only design (see `docs/product-analytics.md`),
  not proportionate to unlock one signal type.
- **No cross-signal aggregation/dashboard beyond the ranked list**
  (e.g. "avoids" signals over time as a trend chart) — premature at
  one or two pilots; worth building once there's enough volume to need
  a trend, not a list.

## Verification

tsc/eslint/795 tests (791 existing + 4 new, `lib/platform/__tests__/product-signals.test.ts` covering the fixed 8-type vocabulary and the impact×frequency priority function)/build all clean. Live-verified in mock mode: the "Product signals" card on `/platform/companies/pc_atlas` renders the log form and 4 realistic mock signals correctly ranked (priority 9, 4, 3, 1 descending); `/platform/product-signals` renders the same ranked list with company names, and the status filter pills (All/Open/Planned/Shipped/Declined) correctly narrow the list via `?status=` while preserving rank order within the filtered set.
