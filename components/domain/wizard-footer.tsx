"use client"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

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
 * parent per step; this only renders and wires the two buttons. */
function WizardFooter({
  onBack,
  backDisabled,
  onContinue,
  continueLabel = "Continue",
  continueDisabled,
  continuePending,
  hideContinue,
}: WizardFooterProps) {
  return (
    <div className="sticky bottom-4 flex justify-between gap-2 rounded-3xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
      <Button type="button" variant="outline" onClick={onBack} disabled={backDisabled}>
        Back
      </Button>
      {!hideContinue && onContinue && (
        <Button type="button" onClick={onContinue} disabled={continueDisabled}>
          {continuePending && <Loader2 className="animate-spin" />}
          {continueLabel}
        </Button>
      )}
    </div>
  )
}

export { WizardFooter }
