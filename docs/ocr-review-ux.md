# OCR Review UX

Productization wave 3 phase 22 — "make AI extraction save time instead
of creating another form... the owner mostly reviews exceptions
instead of retyping the document."

## What was built, per rule

- **High-confidence fields appear accepted** — `DocumentConfidenceRow`
  now shows a quiet green "Accepted" label instead of
  `ConfidenceIndicator`'s percentage when a field's tier is positive.
  (`ConfidenceIndicator` itself is untouched — it's shared well beyond
  document scanning, e.g. `ai-recommendation-card.tsx` — this is a
  local override in `DocumentConfidenceRow`'s own JSX.)
- **Low-confidence fields are clearly highlighted** — a critical-tier
  row gets its own highlighted container (red left border + tinted
  background, this app's existing `toneClasses.critical` vocabulary),
  not just "the input happens to be open" as the only signal.
- **Jump directly between uncertain fields** — `ConfidenceSummary`
  (phase 21) gains a "Next issue" button that `scrollIntoView` +
  focuses the next critical-tier row in that scan block, cycling back
  to the first after the last. Needed `DocumentConfidenceRow` to
  forward a ref to its wrapping div so a parent can actually reach a
  specific row's DOM node.
- **Original image remains easy to inspect** — a small thumbnail of
  the exact photo that was scanned sits next to each scan button,
  derived from the `File` `DocumentScanCapture` already hands back (no
  change needed to the capture handlers). Tap/click opens it full-size
  in the existing `Sheet` primitive (no new dependency).
- **Never silently overwrite corrected user data** — a real bug found
  during research: both `CustomerOnboardingWizard` and
  `NewRentalWizard`'s scan handlers unconditionally overwrote every
  extracted field on each new scan result. Manually fix a low-
  confidence field, then re-scan the same document (phase 21's
  "Retake" button makes this an easy, common path) — the correction
  was silently discarded the instant the new result landed. Fixed with
  a per-scan-block `manuallyEditedRef` (a `Set<string>`, populated
  inline in each field's `onChange` — which per `DocumentConfidenceRow`'s
  own `commit()` only fires on a real user edit, never the initial
  scan-driven fill). A retake still refreshes everything the user
  hasn't touched; only what they explicitly corrected survives.

## Two lint errors caught and fixed before they shipped

1. `autoFocus` on a critical-tier input in an early draft of
   `DocumentConfidenceRow` — phase 02's own memory notes already
   identified and fixed this exact bug once (clicking anything else on
   the page silently committed/closed the field's edit state). Caught
   and removed before running any checks.
2. `react-hooks/refs`: a shared `markEdited(key, setter)` factory
   function meant a ref was touched by code running during render, not
   only inside an event handler. Fixed by inlining the ref-touching
   logic directly into each row's `onChange` arrow function.
3. `react-hooks/set-state-in-effect`: deriving the image-preview URL
   via `useState` + `useEffect` triggered this rule (state purely
   derivable during render shouldn't be set from an effect). Fixed
   with `useMemo` for the derivation and a plain effect only for
   revoking the URL on cleanup — React's own "you might not need an
   effect" guidance.

## Verification, and an honest environmental limit

This environment has **no AI provider key configured anywhere**
(`OPENAI_API_KEY`/`ANTHROPIC_API_KEY` both absent) — confirmed by
grepping `.env.local`. Real extraction can therefore never succeed
here, which means `idFields`/`licenceFields` never populate through
the live wizard, and neither can "Next issue" navigation or the
silent-overwrite fix be exercised interactively through the actual
scan-and-extract flow this session. This is a hard environmental
constraint, not a gap in the code.

What **was** verified live, because it doesn't depend on extraction
succeeding:
- The visual states (accepted/highlighted) on `/dev/intelligence-components`,
  which has 3 static rows at 99%/91%/68% covering all three tiers.
- The image-inspect thumbnail and Sheet — these only depend on a file
  being captured, not on extraction succeeding, so a synthetic test
  JPEG uploaded through the real file input confirmed the thumbnail
  appears immediately and opens correctly in the Sheet, zero console
  errors.

What was verified by rigorous code review instead of a live pass
(rules 3 and 5's wizard-embedded logic): the `manuallyEditedRef` guard
conditions in both `handleIdCaptured`/`handleLicenceCaptured`, and the
`goToNextIssue` cycling logic. tsc/lint/test(575)/build all clean at
every checkpoint.
