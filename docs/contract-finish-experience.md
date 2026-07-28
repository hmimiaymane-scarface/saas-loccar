# Contract Finish Experience

Productization wave 3 phase 26 — "make contracts feel like the natural
final step... contract preparation no longer feels like a separate
module."

## What already existed before this phase

Nearly every individual capability the brief asks for was already
built, across roadmap phases 10/11: a full preview page distinguishing
auto-generated info from legal text, with blocking errors and advisory
warnings shown separately
(`/reservations/[id]/contract-preview`); Print (`window.print()`) and
Download, plus a mobile Share fallback
(`ContractPdfActions`); the full signature flow
(`ContractSignatureSection`); lifecycle status with a real status badge
(`ContractStatusBadge`, `ContractLifecycleActions`). None of that
needed rebuilding.

## The real gap: everything lived one click away, with no signal at all before that click

The reservation detail page's own Contract card — the natural place an
owner finishing a rental would look — showed only a bare "Generate
contract" button and, once one existed, a plain list of
"Generated {date}" rows with no status. There was no way to tell
"is this reservation even ready for a contract" without clicking
through to the preview page, and once a contract existed, no way to
tell "is it signed yet" without clicking through to its own page. That
gap — not a missing capability, but a missing *signal at the point
where the owner is actually working* — is what made contract prep feel
like a separate module.

## What was built

**`lib/contracts/template-store.ts#getContractReadiness`** — a new,
deliberately cheap readiness check. Reuses the same
`resolveContractInputs` the preview page's full validation already
runs, but stops there — it does **not** call `flagContractPreviewIssues`
(the real `askAI()` advisory pass `previewContract` layers on top).
That distinction matters: this function is meant to run on every
reservation-page view, and an AI call per page view would be a real,
avoidable cost this app has never accepted elsewhere (see
`lib/operations-feed/pricing-ai.ts`'s own "one batched call, never one
per candidate" discipline). Tested with a fake Supabase client proving
both the ready and not-ready cases, and explicitly asserting the AI
mock is never invoked.

**`ContractReadinessBadge`** (new, pure) — "Ready to generate" (emerald)
or "Needs review" (amber) plus the specific blocking messages listed
right there, reusing `resolveContractInputs`'s existing plain-language
issue text (no new copy to maintain in two places). Shown on the
reservation page's Contract card only when no contract has been
generated yet.

**Existing contracts now show their real lifecycle status inline** —
each row in the Contract card's list now renders the same
`ContractStatusBadge` the dedicated contract page already used,
reusing data (`ContractRecord.status`) that was already being fetched
and simply wasn't rendered.

**Send later, honestly stubbed** — `ContractPdfActions` gets a fourth,
disabled "Send" button (native `title` attribute explaining why,
instead of Radix's Tooltip primitive, which doesn't reliably fire on a
genuinely `disabled` element). No messaging integration exists anywhere
in this app yet (confirmed against `docs/notifications.md` and this
session's own phase 09 finding that "no messaging/comms concept exists
anywhere in this codebase") — a disabled, clearly-labeled stub is the
honest choice, not a fake "Sent" state and not silently omitting a
button the brief explicitly asks for.

## Verification

`npx tsc --noEmit`, `npm run lint`, `npm run test` (591 tests, 3 new),
and `npm run build` were clean at every checkpoint.

**Real mock-mode browser verification, and its honest limit**: the
contract engine has been fully live-Supabase-only since it was first
built in phase 10 — more so than most other AI/DB-touching features in
this app, since even the *read-only* `/contracts/[id]` page itself
calls `notFound()` outright when Supabase isn't configured (its own
code comment: "no organic way to reach a real contract id in mock mode
anyway"). Confirmed the reservation detail page (`/reservations/bk_1`)
still renders cleanly with the redesigned Contract card and zero
console errors — `contracts`/`contractReadiness` both correctly degrade
to empty/`null` in mock mode, so the card shows just its header, not a
crash. The new `ContractReadinessBadge`, the per-row `ContractStatusBadge`,
and the disabled Send button were not directly observed rendering with
real data this session, for the same reason every contract-engine
phase since 10 has carried this exact caveat. Correctness rests on: a
clean tsc/lint pass, hand-fixture tests for the new readiness function,
and both new UI pieces being thin, typed reuses of already-live-verified
primitives (`StatusBadge`, `ContractStatusBadge` itself, and
`ContractPdfActions`'s existing button row).
