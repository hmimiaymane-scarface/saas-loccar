# Plain-Language Copy Pass

Roadmap phase 55, fifth phase of Wave 8 ("Polish, Observability,
Security, and Launch Confidence"), titled "French Copy Rewrite" in the
roadmap. Brief: "make interface language natural and simple. Remove:
technical SaaS vocabulary, AI jargon, accounting jargon where
unnecessary, long explanatory labels. Prefer direct operational
language. Done when: a rental owner understands screens without
training."

## Scope interpretation (read this first)

Despite the phase's title, this was **not** a translation pass. This
app has zero i18n infrastructure (confirmed in phase 54's audit — no
`next-intl`/translations directory/locale files anywhere), and phase
56's own brief ("Arabic/RTL Readiness Pass") explicitly says "full
translation can remain later" — which only makes sense if this phase
didn't do full translation either. The brief's actual content (remove
jargon, prefer direct language, a rental owner should understand
screens without training) is a plain-language simplification pass on
the app's existing English copy — the same copy that will eventually
need translating, made simpler and more literal so that translation
is easier and cheaper whenever it happens. This interpretation was
made autonomously (the user handed phases 55/56 together and asked
for full autonomous execution) and is flagged here explicitly so it's
easy to correct if a literal French translation was actually intended.

## Audit approach

A dedicated research pass catalogued every place user-facing copy
(not code comments, not variable names) used jargon across five
categories the brief names, plus a sixth checking for any existing
documented copy convention this phase should respect rather than
override. Fixes only touched confirmed, cataloged instances — this
wasn't a blind find-and-replace across "AI"/"dashboard"/etc.

## What was fixed

**Branded/SaaS-style feature names** (the only 4 places this kind of
branding actually rendered as on-screen text, out of the whole app):
- `components/domain/overview/business-pulse-grid.tsx` — "Business
  Pulse" → **"At a glance"**. The row labels inside it ("Fleet
  Status", "Customers", "Revenue", etc.) were already plain English —
  only the card's own title was renamed.
- `components/domain/overview/revenue-intelligence-card.tsx` —
  "Revenue Intelligence" → **"Revenue this month"**.
- `components/domain/fleet/vehicle-insights-section.tsx` — "AI
  Insights" → **"Insights"**.
- `components/domain/intelligence/ai-recommendation-card.tsx` — "AI
  recommendation" → **"Suggestion"**.
- `app/(dashboard)/operations-feed/page.tsx` — "Operations Feed" →
  **"Alerts"**, and its description simplified to "Things worth a
  look — most important first." No main-nav link points at this
  route (confirmed by grep) — it's the minimal standalone page phase
  12 built before phase 13 folded the same feed into Overview — so
  the rename's blast radius is exactly this one page.
- `components/domain/operations-feed/operations-feed-list.tsx` —
  caught live while verifying the rename above: its own empty-state
  said "The operations feed is quiet — no output is a good output,"
  an engineering-flavored phrase the original audit missed. Rewritten
  to "All quiet right now — that's a good thing."

**"dashboard" → "Overview" wording consistency** — three spots
(`app/invite/[token]/page.tsx`, `components/onboarding/onboarding-wizard.tsx`,
`components/domain/platform/subscription-actions.tsx`) said "go to
your dashboard"/"locked out of the dashboard," even though the app's
own main page has always been named "Overview" everywhere else (nav
label, page title). "Dashboard" is itself a step toward generic SaaS
vocabulary — fixed all three to say "Overview page," matching the
app's own established name for itself.

**"variable mapping" jargon** — `contract-templates/page.tsx` and its
version-detail page both described the AI-proposed field-matching
step as a "variable mapping," a real technical term meaning nothing
to a rental owner. Rewritten as "we'll fill in the matching fields
for you to check" / "Check the matched fields before this version
goes live" — same meaning, no jargon.

**Over-explained descriptions** — `recent-imports.tsx`'s undo-behavior
description (~30 words, the single most over-explained string the
audit found) trimmed to two short sentences covering the same three
facts without the multi-clause hedging. `ai-assistant/page.tsx`'s
description simplified ("your data" → "a question," "confirm" →
"approve") as a smaller, lower-risk cleanup alongside it.

## Deliberately not changed

- **"AI Assistant" as a feature name** — left as-is. Unlike "AI
  Insights"/"AI recommendation" (labels sitting on top of otherwise
  plain content), "AI Assistant" names an actual chat feature the
  same way "Siri" or "Alexa" names an assistant — it's understood
  colloquially today, not jargon in the sense the brief means.
- **Confidence percentages** ("87% confident," `confidence-indicator.tsx`)
  — left as-is. This is functionally important during document-scan
  review (customer ID/licence onboarding) — a rental owner genuinely
  needs to know how sure the system is about a scanned field, and
  "X% confident" is already plain English, not a jargon term.
- **"sync"/"syncing"** (`offline-queue/page.tsx`, `offline-status-banner.tsx`)
  — left as-is. "Sync" is understood by anyone who's used a
  smartphone; rewriting it risked losing the one word that actually
  and precisely names the offline-queue behavior.
- **"Needs Attention" score badge** (`lib/tone.ts#scoreBand`) — left
  as-is, already plain English, not jargon.
- **"Add an OpenAI or Anthropic API key to your environment"**
  (`ai-assistant/page.tsx`'s not-configured state) — left as-is. This
  message is only ever seen by whoever deploys/configures the app
  (a technical audience by definition), not by a day-to-day rental
  owner — matches this project's own established judgment-call
  precedent (phase 51/53) of not "fixing" copy that's already correct
  for its actual audience.
- **Financial Report's "operating result"/"accounting result" wording**
  (`financial-report-card.tsx`, `reports/page.tsx`) — left as-is. The
  audit confirmed this phrase is doing real disclaiming work (this
  isn't a certified accounting statement, deposits aren't revenue),
  not jargon for jargon's sake — softening the wording risked
  softening the disclaimer itself.
- **No i18n infrastructure was built** — out of scope by design, per
  phase 56's own "full translation can remain later" and the scope
  interpretation above. A real translation phase, if pursued later,
  is its own dedicated effort.

## Verification

tsc/eslint/757 tests/build clean at every checkpoint (no test
asserted on any of the renamed strings, confirmed by grep before each
change). Live mock-mode browser check confirmed "Alerts" renders
correctly on `/operations-feed` with its new description — and while
there, its empty-state copy ("The operations feed is quiet — no
output is a good output") turned out to be its own jargon leak the
original audit missed ("output" is an engineering word); fixed to
"All quiet right now — that's a good thing" as a same-pass addendum.

"At a glance" (`BusinessPulseGrid`) and "Revenue this month"
(`RevenueIntelligenceCard`) could **not** be reached live: both are
conditionally rendered only when `extras.pulse`/`extras.revenueIntel`
are non-null, and `loadIntelligenceExtras` returns them as `null` in
mock mode by design (Supabase-only intelligence reads, same pattern
documented in phases 49/53). The vehicle-detail "Insights" section is
the same shape (`VehicleInsightsSection` returns `null` with no
recommendations, and the mock fixture vehicle checked had none). The
onboarding wizard's "Overview page" wording couldn't be reached either
— `/onboarding` redirects straight to `/overview` once a company
already exists, which the mock session always does. All four were
verified instead by reading the exact rendered JSX and confirming
tsc/build passed — these are plain string literal changes with no
logic behind them, so that's a reasonably strong signal on its own,
but live pixels weren't captured for them the way "Alerts" was.
