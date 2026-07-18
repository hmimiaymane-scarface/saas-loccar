"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { updateCompanySettings, type SettingsActionState } from "@/app/(dashboard)/settings/actions"
import type { NotificationType, RentalCompany } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const MUTABLE_NOTIFICATION_TYPES: { value: NotificationType; label: string }[] = [
  { value: "pickup_approaching", label: "Pickup approaching" },
  { value: "return_approaching", label: "Return approaching" },
  { value: "rental_overdue", label: "Rental overdue" },
  { value: "outstanding_balance", label: "Outstanding balance" },
  { value: "deposit_unresolved", label: "Deposit unresolved" },
  { value: "maintenance_due", label: "Maintenance due" },
  { value: "maintenance_overdue", label: "Maintenance overdue" },
  { value: "vehicle_document_expiring", label: "Vehicle document expiring" },
  { value: "licence_expiring", label: "Driving licence expiring" },
  { value: "damage_recorded", label: "New damage" },
  { value: "vehicle_unavailable_upcoming_reservation", label: "Unavailable vehicle with upcoming booking" },
]

const initialState: SettingsActionState = {}

function CompanySettingsForm({ company }: { company: RentalCompany }) {
  const [state, formAction, isPending] = useActionState(updateCompanySettings, initialState)
  const muted = new Set(company.mutedNotificationTypes)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Sensible defaults — change only what you need to.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maintenanceReminderDays">Maintenance reminder threshold (days)</Label>
              <Input
                id="maintenanceReminderDays"
                name="maintenanceReminderDays"
                type="number"
                min="1"
                defaultValue={company.maintenanceReminderDays}
                required
              />
              <p className="text-xs text-muted-foreground">Show scheduled maintenance as due this many days before it&apos;s scheduled.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="documentExpiryWarningDays">Document expiry warning threshold (days)</Label>
              <Input
                id="documentExpiryWarningDays"
                name="documentExpiryWarningDays"
                type="number"
                min="1"
                defaultValue={company.documentExpiryWarningDays}
                required
              />
              <p className="text-xs text-muted-foreground">Warn about expiring vehicle documents and driving licences this many days ahead.</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="agentsCanRecordExpenses" defaultChecked={company.agentsCanRecordExpenses} />
            Allow agents to record expenses
          </label>

          <Separator />

          <div className="flex flex-col gap-2">
            <Label>Notification types to mute</Label>
            <p className="text-xs text-muted-foreground">Muted alerts are hidden company-wide, in the bell and the notification center.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MUTABLE_NOTIFICATION_TYPES.map((t) => (
                <label key={t.value} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" name="mutedNotificationTypes" value={t.value} defaultChecked={muted.has(t.value)} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Currency</span>
              <span className="text-foreground">{company.currency}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Time zone</span>
              <span className="text-foreground">{company.timezone}</span>
            </div>
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Save preferences
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export { CompanySettingsForm }
