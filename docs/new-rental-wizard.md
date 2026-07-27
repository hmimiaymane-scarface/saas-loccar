# New Rental Wizard

Productization wave 3 phase 18 — "make starting a rental the best
experience in the product... the owner never needs to manually
navigate between modules." `/reservations/new` used to be a single
form; it's now `NewRentalWizard`
(`components/domain/reservations/new-rental-wizard.tsx`), one
continuous flow from customer search through an active rental.

## What this replaces

Traced the actual pre-phase-18 code path end to end: completing a new
rental (new customer, signed contract, deposit collected, vehicle
picked up) took **7 page loads across 3 separate route trees** —
`/customers/new` → `/reservations/new` → `/reservations/[id]` →
`/reservations/[id]/pickup` → `/reservations/[id]` again →
`/reservations/[id]/contract-preview` → `/contracts/[id]`. Every one of
those underlying features already worked — this phase is about
removing the navigation between them, not rebuilding anything that was
broken.

The standalone routes (`/customers/new`, `/reservations/[id]/pickup`,
`/reservations/[id]/contract-preview`, `/contracts/[id]`) are **not**
deleted — they're still the right place to resume an abandoned wizard
after a browser refresh, edit something later, or reprint a contract
months afterward. The wizard is the primary path, not the only path.

## The 5 steps

1. **Customer** — search/select an existing customer (unchanged
   `searchCustomers`), or add a new one inline: quick name+phone, or a
   full ID + driving-licence scan reusing `DocumentScanCapture` +
   `DocumentConfidenceRow` directly (the same confidence-gated
   correction UX — only low-confidence fields start open for editing —
   built for the standalone customer-onboarding wizard). Creating the
   customer here calls `createCustomer` directly and stays on the page
   instead of `router.push`-ing to `/customers/new`'s own success
   redirect.
2. **Vehicle, dates & price** — embeds `ReservationForm` itself,
   unmodified in spirit: it already fully supported a
   `preselectedCustomer` mode (built for roadmap phase 09's returning-
   customer fast path) where the customer block renders read-only and
   only vehicle/dates/price remain editable — exactly this step's
   shape. Creating the reservation here uses a new
   `createReservationInWizard` action (see below) instead of
   `createReservation`, so success advances the wizard instead of
   redirecting to the reservation detail page.
3. **Payment & deposit** (optional, skippable) — `recordPayment`/
   `collectDeposit`, the same actions `PickupWizard` already uses,
   just reachable immediately instead of only from inside pickup.
4. **Pickup inspection** — `PickupWizard`'s inspection sub-step reused
   directly: odometer, fuel level, cleanliness, overall condition,
   checklist, photos, notes, and the same `startInspection`/
   `saveInspectionFields`/`saveChecklistResponse`/`attachInspectionMedia`
   actions. Deliberately narrower than `PickupWizard` itself — no
   Documents or existing-damage sub-steps here, since this wizard's
   own Steps 1-2 already cover customer identity and the reservation.
5. **Contract & start rental** — chains `generateContractAction` →
   `prepareContractAction` → `sendContractForSignatureAction` into one
   button, then a simplified inline typed-name + confirmation
   signature capture (`addSignatureAction`) — not the full
   `ContractSignatureSection` component, since that one expects a
   Server Component parent to re-fetch fresh signatures after each of
   its own `router.refresh()` calls; this wizard tracks signatures in
   its own client state instead. "Start rental" mirrors
   `PickupWizard`'s own `activate()` exactly: checks
   `missingRequiredPhotoSlots` first, then `completeInspectionAction`,
   then `activateRentalAction`, with the same owner/manager
   override-reason fallback `activate_rental()` itself requires.

## Why contract signing never blocks "Start rental"

`activate_rental()` (the actual DB function) never references
`contracts`/`contract_signatures` at all — only an assigned vehicle and
a *completed* pickup inspection are hard-gated (owner/manager can
override the inspection requirement with a mandatory reason; agents
cannot). Since the database itself doesn't enforce contract-before-
activation, this wizard doesn't invent a new hard rule either — an
unsigned contract shows a visible warning, but "Start rental" stays
available regardless, matching this app's existing "advisory, not
silently blocking" convention used everywhere else a signal isn't a
real DB gate.

## The one real refactor this required: `createReservation`'s redirect

`createReservation` (`app/(dashboard)/reservations/actions.ts`) ended
with a hard `redirect(/reservations/{id})` — reusing it as `ReservationForm`'s
injected `action` prop as-is would have broken straight out of the
wizard. Fixed by extracting the shared insert logic (customer
resolution → pricing → reservation insert → activity-log event → cache
revalidation) into a private `insertReservation(formData, redirectOnSuccess)`
both functions call: `createReservation` keeps its exact original
behavior (still used by `/reservations/[id]/edit`'s own `ReservationForm`
instance, unaffected), and the new `createReservationInWizard` returns
`{reservationId}` instead. `ReservationForm` itself gained one optional
`onSuccess(reservationId, totalMad)` callback, fired from
`state.reservationId` (only set by the no-redirect action) instead of
the normal redirect path.

## Known limitation

Contract generation/signing and OCR extraction are Supabase-only
features (same as every AI/database-only feature since the original
roadmap's phase 03) — they degrade gracefully but can't fully execute
against mock data. Verified as far as mock mode allows: every step's
UI, validation, and navigation-free flow between steps.
