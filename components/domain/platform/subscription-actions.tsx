"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { startOrExtendTrial, setSubscriptionStatus, updateSubscriptionDates, updatePlan } from "@/app/platform/actions"
import { canReactivate } from "@/lib/platform/subscription-rules"
import type { PlatformCompanySummary } from "@/types/platform"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

function SubscriptionActions({ companyId, subscription }: { companyId: string; subscription: PlatformCompanySummary["subscription"] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [trialEndsOn, setTrialEndsOn] = useState(subscription.trialEndsOn ?? "")
  const [subStartsOn, setSubStartsOn] = useState(subscription.subscriptionStartsOn ?? "")
  const [subEndsOn, setSubEndsOn] = useState(subscription.subscriptionEndsOn ?? "")
  const [planLabel, setPlanLabel] = useState(subscription.planLabel)
  const [monthlyPrice, setMonthlyPrice] = useState(subscription.monthlyPriceMad != null ? String(subscription.monthlyPriceMad) : "")

  const [confirmingAction, setConfirmingAction] = useState<"suspend" | "cancel" | null>(null)
  const [reason, setReason] = useState("")

  function run(action: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else {
        setConfirmingAction(null)
        setReason("")
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>Trial</Label>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">New trial end date</span>
              <Input type="date" value={trialEndsOn} onChange={(e) => setTrialEndsOn(e.target.value)} className="w-44" />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={isPending || !trialEndsOn}
              onClick={() => run(() => startOrExtendTrial(companyId, trialEndsOn))}
            >
              {isPending && <Loader2 className="animate-spin" />}
              Start or extend trial
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <Label>Plan</Label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input value={planLabel} onChange={(e) => setPlanLabel(e.target.value)} placeholder="Standard, Custom…" />
            <Input
              type="number"
              step="0.01"
              min="0"
              value={monthlyPrice}
              onChange={(e) => setMonthlyPrice(e.target.value)}
              placeholder="Monthly price (MAD)"
              className="w-40"
            />
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() => run(() => updatePlan(companyId, planLabel, monthlyPrice ? Number(monthlyPrice) : null))}
            >
              Save plan
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <Label>Subscription dates</Label>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Start</span>
              <Input type="date" value={subStartsOn} onChange={(e) => setSubStartsOn(e.target.value)} className="w-44" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Renewal / end date</span>
              <Input type="date" value={subEndsOn} onChange={(e) => setSubEndsOn(e.target.value)} className="w-44" />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() => run(() => updateSubscriptionDates(companyId, subStartsOn || null, subEndsOn || null))}
            >
              Save dates
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <Label>Status</Label>
          <div className="flex flex-wrap gap-2">
            {subscription.status !== "active" && (
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => run(() => setSubscriptionStatus(companyId, "active"))}>
                Mark active
              </Button>
            )}
            {canReactivate(subscription.status) && (
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => run(() => setSubscriptionStatus(companyId, "active"))}>
                Reactivate
              </Button>
            )}
            {subscription.status !== "suspended" && confirmingAction !== "suspend" && (
              <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => setConfirmingAction("suspend")}>
                Suspend access
              </Button>
            )}
            {subscription.status !== "cancelled" && confirmingAction !== "cancel" && (
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setConfirmingAction("cancel")}>
                Mark cancelled
              </Button>
            )}
          </div>

          {confirmingAction && (
            <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">
              <p className="text-sm font-medium text-foreground">
                {confirmingAction === "suspend"
                  ? "Suspend access? Their team will be shown an account-paused page and locked out of the dashboard. Nothing is deleted."
                  : "Mark this subscription cancelled? Access is paused the same way as suspension."}
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reason">Reason (internal, optional)</Label>
                <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingAction(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={() => run(() => setSubscriptionStatus(companyId, confirmingAction === "suspend" ? "suspended" : "cancelled", reason))}
                >
                  {isPending && <Loader2 className="animate-spin" />}
                  Confirm {confirmingAction === "suspend" ? "suspension" : "cancellation"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export { SubscriptionActions }
