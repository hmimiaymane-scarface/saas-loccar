import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

interface WizardStep {
  label: string
}

function WizardProgress({ steps, currentStep }: { steps: WizardStep[]; currentStep: number }) {
  return (
    <div className="flex flex-col gap-2">
      {/* Desktop: full step row */}
      <ol className="hidden items-center gap-2 sm:flex">
        {steps.map((step, i) => {
          const isDone = i < currentStep
          const isCurrent = i === currentStep
          return (
            <li key={step.label} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors duration-200",
                  isDone
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                      ? "bg-primary/10 text-primary ring-2 ring-primary"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {isDone ? <Check key="done" className="size-3.5 animate-in zoom-in-50 fade-in-0 duration-200" /> : i + 1}
              </div>
              <span
                className={cn(
                  "truncate text-sm transition-colors duration-200",
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
              {i < steps.length - 1 && (
                <div className={cn("mx-1 h-px flex-1 transition-colors duration-200", isDone ? "bg-primary" : "bg-border")} />
              )}
            </li>
          )
        })}
      </ol>

      {/* Mobile: compact progress bar */}
      <div className="flex flex-col gap-1.5 sm:hidden">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="font-medium text-foreground">{steps[currentStep]?.label}</span>
        </div>
        <div className="flex h-1.5 gap-1">
          {steps.map((step, i) => (
            <div
              key={step.label}
              className={cn(
                "flex-1 rounded-full transition-colors duration-200",
                i <= currentStep ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export { WizardProgress }
