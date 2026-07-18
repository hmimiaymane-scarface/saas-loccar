import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { isSupabaseConfigured } from "@/lib/env"
import { OnboardingForm } from "@/components/onboarding/onboarding-form"

export const metadata: Metadata = { title: "Set up your company" }

export default function OnboardingPage() {
  // Mock/demo mode has no auth gate and no company to create — send
  // straight to the working demo dashboard instead of a form that would
  // fail (no Supabase connection to call the RPC against).
  if (!isSupabaseConfigured) {
    redirect("/overview")
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-muted/40 px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
            RO
          </div>
          <span className="font-heading text-base font-medium text-foreground">
            Rental Office
          </span>
        </div>
        <OnboardingForm />
      </div>
    </div>
  )
}
