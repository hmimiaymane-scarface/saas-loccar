"use client"

import { AlertTriangle, Check, Loader2 } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { VariantProps } from "class-variance-authority"
import type { SubmitStatus } from "@/hooks/use-submit-guard"

interface SubmitButtonProps
  extends Omit<React.ComponentProps<"button">, "children">,
    VariantProps<typeof buttonVariants> {
  status: SubmitStatus
  children: React.ReactNode
  savingLabel?: string
  slowLabel?: string
  savedLabel?: string
  errorLabel?: string
  /** Only meaningful when `status === "error"` and this button isn't a
   * native form submit — e.g. `useSubmitGuard`'s `retry`. A submit
   * button inside a `useActionState` form doesn't need this: clicking
   * it again just resubmits the form the normal way. */
  onRetry?: () => void
  asChild?: boolean
}

/**
 * Roadmap phase 40 (Slow-Network Experience). Consolidates the
 * hand-rolled `disabled={isPending}` + inline `Loader2` spinner that
 * 61 files each re-implement (per the phase's research pass) into one
 * component with two more states those call sites didn't have before:
 * "slow" (still going past `SLOW_THRESHOLD_MS` — reads as "working",
 * not frozen) and "saved" (a brief, real confirmation instead of just
 * silently going back to idle). `status` is deliberately just a plain
 * prop, not something this component computes itself — pair it with
 * `useSlowPending(isPending)` for a `useActionState` form, or
 * `useSubmitGuard()` for an imperative action, per which one the
 * caller already has.
 */
function SubmitButton({
  status,
  children,
  savingLabel = "Saving…",
  slowLabel = "Still working…",
  savedLabel = "Saved",
  errorLabel = "Retry",
  onRetry,
  onClick,
  disabled,
  className,
  variant,
  ...props
}: SubmitButtonProps) {
  const isBusy = status === "pending" || status === "slow"

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (status === "error" && onRetry) {
      event.preventDefault()
      onRetry()
      return
    }
    onClick?.(event)
  }

  return (
    <Button
      variant={status === "error" ? "destructive" : variant}
      className={cn(status === "saved" && "bg-emerald-600 text-white hover:bg-emerald-600", className)}
      disabled={disabled || isBusy}
      onClick={handleClick}
      aria-live="polite"
      {...props}
    >
      {status === "pending" && <Loader2 className="animate-spin" />}
      {status === "slow" && <Loader2 className="animate-spin" />}
      {status === "saved" && <Check className="animate-in zoom-in-50 fade-in-0 duration-200" />}
      {status === "error" && <AlertTriangle />}
      {status === "pending" && savingLabel}
      {status === "slow" && slowLabel}
      {status === "saved" && savedLabel}
      {status === "error" && errorLabel}
      {status === "idle" && children}
    </Button>
  )
}

export { SubmitButton }
