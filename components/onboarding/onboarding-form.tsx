"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { createCompany, type OnboardingActionState } from "@/app/onboarding/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

const initialState: OnboardingActionState = {}

const selectClassName =
  "flex h-9 w-full min-w-0 rounded-2xl border border-border bg-background px-3 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(createCompany, initialState)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Set up your company</CardTitle>
        <CardDescription>
          A few details to create your workspace — you can refine everything later in Settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Company name</Label>
            <Input id="name" name="name" placeholder="Atlas Rent Car" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" placeholder="Marrakech" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" placeholder="+212 6XX-XXXXXX" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <select id="currency" name="currency" defaultValue="MAD" className={selectClassName}>
                <option value="MAD">MAD — Moroccan dirham</option>
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — US dollar</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="language">Language</Label>
              <select id="language" name="language" defaultValue="fr" className={selectClassName}>
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {state.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="mt-1 w-full">
            {isPending && <Loader2 className="animate-spin" />}
            Create workspace
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export { OnboardingForm }
