"use client"

import { Button } from "@/components/ui/button"
import { SubmitButton } from "@/components/ui/submit-button"
import { useSlowPending } from "@/hooks/use-slow-pending"

interface WizardFooterProps {
  onBack: () => void
  backDisabled?: boolean
  onContinue?: () => void
  continueLabel?: string
  continueDisabled?: boolean
  continuePending?: boolean
  hideContinue?: boolean
}

/** Sticky Back/Continue nav shared by the pickup and return wizards —
 * what each step's "Continue" actually does is still decided by the
 * parent per step; this only renders and wires the two buttons.
 * Roadmap phase 40 — `continuePending` now also feeds `useSlowPending`
 * so a step that's genuinely slow (an AI call, an upload) reads as
 * "still working" rather than looking frozen past a few seconds. */
function WizardFooter({
  onBack,
  backDisabled,
  onContinue,
  continueLabel = "Continue",
  continueDisabled,
  continuePending,
  hideContinue,
}: WizardFooterProps) {
  const isSlow = useSlowPending(Boolean(continuePending))

  return (
    <div className="sticky bottom-4 flex justify-between gap-2 rounded-3xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
      <Button type="button" variant="outline" onClick={onBack} disabled={backDisabled}>
        Back
      </Button>
      {!hideContinue && onContinue && (
        <SubmitButton
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          status={continuePending ? (isSlow ? "slow" : "pending") : "idle"}
        >
          {continueLabel}
        </SubmitButton>
      )}
    </div>
  )
}

export { WizardFooter }
