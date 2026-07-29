# Real Android Device Test Matrix

Wave 5 phase 36. Brief: test on phones customers may actually use —
modern Android, mid-range Android, older/slower Android if available,
Chrome PWA (installed), weak Wi-Fi, mobile data. Test every sacred
workflow. "Done when: major workflows work reliably outside the
development machine."

## Why this doc exists instead of a code change

This phase asks for something genuinely different from every phase
before it in this roadmap: physical hardware, real cellular/Wi-Fi
conditions, and a human holding a phone. That's not something a coding
agent can execute — there's no physical Android device, no real weak-Wi-Fi
or mobile-data network, and no way to install and interact with a PWA
on real hardware from this environment. Every prior mobile phase (16,
17, and the wave-2/3/4 mobile work) has carried the exact same honest
caveat for this reason — see `docs/mobile.md`'s own "No real device
testing" section, written back at phase 16 and never yet closed.

What follows is the concrete, executable test plan this phase's brief
calls for — grounded in the actual features built (not generic QA
boilerplate), so whoever runs it on real hardware knows exactly what to
open, what to do, and what "working" looks like. **This document is a
plan to execute, not a report of testing already done.**

## Device / condition matrix

| # | Device tier | Suggested example | Browser | Network |
|---|---|---|---|---|
| 1 | Modern Android | A phone from the last ~2 years (Pixel 7/8, Galaxy S22+, similar) | Chrome | Home/office Wi-Fi |
| 2 | Mid-range Android | A common budget/mid-tier model (Galaxy A-series, Redmi/Poco, similar) | Chrome | Home/office Wi-Fi |
| 3 | Older/slower Android | Anything 4+ years old, if available | Chrome | Home/office Wi-Fi |
| 4 | Any of the above | — | **Installed PWA** (Add to Home Screen from `/`, then launch as a standalone app, not a browser tab) | Home/office Wi-Fi |
| 5 | Any of the above | — | Chrome | **Weak Wi-Fi** (throttle via Chrome DevTools remote debugging "Slow 3G" preset, or physically move away from the router) |
| 6 | Any of the above | — | Chrome | **Mobile data** (Wi-Fi off) |

Run the "sacred workflows" below on at least rows 1, 4, 5, and 6 once
each; rows 2/3 are worth a lighter pass (the two or three riskiest
workflows, not all of them) if a mid-range/older device is actually
available.

## Sacred workflows to test end-to-end

Each of these was built and mock-mode-verified during its own roadmap
phase, but never against real hardware/network conditions. For each,
"pass" means: completes without a crash, without silent data loss, and
within a time the person testing would call reasonable (not a stopwatch
target — a human judgment call, per the brief's own framing).

1. **New Rental, start to finish** (`/reservations/new`, or the "New
   Rental" bottom-tab / FAB shortcut) — search or scan a customer,
   select a vehicle, confirm pricing/deposit, complete the pickup
   inspection (all 7 required photos + odometer/fuel + existing-damage
   review), generate/sign the contract. Confirm the phase-27 "Rental
   started" reward banner appears at the end.
2. **Return, start to finish** (`/reservations/[id]/return`) — capture
   return photos/odometer/fuel, review any AI damage-comparison
   suggestion that appears (Accept/Dismiss — confirm it never
   auto-confirms), resolve the deposit, close the rental. Confirm the
   phase-30 completion summary (revenue/duration/deposit result/fleet
   rank) appears.
3. **Offline mid-flow resilience** — start a pickup or return inspection
   with the network on, then turn on airplane mode (or use a weak-Wi-Fi
   condition strong enough to actually drop packets) mid-inspection.
   Confirm captured photos/fields still save locally (an offline status
   indicator, not a hard error) and sync once connectivity returns. This
   is the single most important thing this phase exists to confirm —
   it's the one piece phase 16 explicitly could not verify at all
   without real hardware.
4. **PWA install + launch** — visit the site in Chrome, use "Add to Home
   Screen," then relaunch from the home-screen icon (not a browser tab)
   and confirm it opens as a standalone app (no address bar), the
   correct icon/name, and the mission-feed home screen loads.
5. **WebAuthn passkey sign-in** (`/profile` to register, then sign out
   and sign back in) — the one feature phase 16 flagged as impossible to
   verify without a real biometric sensor (Face ID/Touch ID equivalent,
   fingerprint/face unlock on Android). Confirm registration completes
   and a subsequent sign-in via the passkey prompt actually works.
6. **Mobile calendar swipe navigation** (`/calendar`) — swipe between
   weeks in Week/Availability mode, tap a reservation or maintenance
   block to confirm the summary popover opens correctly.
7. **Notification bell + real-time updates** — confirm the bell's unread
   badge and the informational-noise split (phase 35) render correctly
   on a real small screen, and that a real-time signal (e.g. completing
   a return and immediately checking Notifications) shows up promptly.

## Known risk areas to watch for specifically

Carried over from `docs/mobile.md`'s own documented, never-yet-closed
gaps — these are the parts most likely to behave differently on real
hardware than they did in this environment's mock-mode browser checks:

- The offline queue's actual behavior under a real dropped connection
  (this environment could only unit-test the pure queue logic, never
  exercise a real network drop).
- The WebAuthn ceremony itself (a synthetic click in this environment
  isn't a "trusted user gesture" — real hardware is the first time this
  can genuinely be confirmed end to end).
- Anything viewport-specific: this environment's browser-automation tool
  could never actually resize to a real narrow viewport (confirmed
  repeatedly since phase 14) — every mobile layout claim in this
  codebase rests on an injected-iframe approximation, not a real phone
  screen.
- Performance/responsiveness on an older/slower device specifically —
  nothing in this environment can approximate a genuinely slower CPU.

## What to do with the results

This document doesn't have a "results" section filled in — that's the
next session's job, once real device testing has actually happened.
When it has, the honest outcome (what passed, what didn't, on which
device/network combination) belongs in a follow-up update to this file
or a new dated entry, the same way every other phase in this roadmap
has recorded its real verification account.
