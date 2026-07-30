"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { Pencil, AlertTriangle } from "lucide-react"

import { updateCustomerProfile, type CustomerActionState } from "@/app/(dashboard)/customers/actions"
import type { CustomerDetail } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/ui/submit-button"
import { useSlowPending } from "@/hooks/use-slow-pending"

const initialState: CustomerActionState = {}
const SAVED_CONFIRMATION_MS = 1_200

function CustomerEditForm({ customer }: { customer: CustomerDetail }) {
  const [open, setOpen] = useState(false)
  const action = updateCustomerProfile.bind(null, customer.id)
  const [state, formAction, isPending] = useActionState(action, initialState)
  const isSlowPending = useSlowPending(isPending)
  const acknowledgeDuplicatesRef = useRef<HTMLInputElement>(null)

  // This inline edit card previously just sat there after a successful
  // save with zero confirmation — the user had to infer success from
  // the absence of an error. Roadmap phase 40: show a real "Saved"
  // pulse, then close, on the pending->resolved-with-no-error edge.
  const wasPendingRef = useRef(false)
  const [justSaved, setJustSaved] = useState(false)
  useEffect(() => {
    const finishedSuccessfully = wasPendingRef.current && !isPending && !state.error && !state.duplicateCandidates
    wasPendingRef.current = isPending
    if (!finishedSuccessfully) return
    setJustSaved(true)
    const timer = setTimeout(() => {
      setJustSaved(false)
      setOpen(false)
    }, SAVED_CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [isPending, state])

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil />
        Edit profile
      </Button>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" defaultValue={customer.fullName} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={customer.phone} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={customer.email ?? undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nationality">Nationality</Label>
          <Input id="nationality" name="nationality" defaultValue={customer.nationality ?? undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={customer.dateOfBirth ?? undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="idDocumentNumber">ID document number</Label>
          <Input id="idDocumentNumber" name="idDocumentNumber" defaultValue={customer.idDocumentNumber ?? undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="licenseNumber">Licence number</Label>
          <Input id="licenseNumber" name="licenseNumber" defaultValue={customer.licenseNumber ?? undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="licenseExpiresOn">Licence expires</Label>
          <Input id="licenseExpiresOn" name="licenseExpiresOn" type="date" defaultValue={customer.licenseExpiresAt ?? undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" name="address" defaultValue={customer.address ?? undefined} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={customer.notes ?? undefined}
          className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="marketingConsent"
          value="true"
          defaultChecked={customer.marketingConsent}
          className="size-4 rounded border-input"
        />
        Customer has consented to marketing communications
      </label>

      <input ref={acknowledgeDuplicatesRef} type="hidden" name="acknowledgeDuplicates" defaultValue="false" />

      {/* Same duplicate check as CustomerForm (roadmap phase 08
          requirement 3: "creating or editing a customer") — never
          blocks saving. */}
      {state.duplicateCandidates && state.duplicateCandidates.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            These edits now look like they might match another customer
          </span>
          <ul className="flex flex-col gap-1.5">
            {state.duplicateCandidates.map((candidate) => (
              <li key={candidate.customerId} className="flex items-center justify-between gap-3">
                <span>
                  {candidate.fullName} — {candidate.confidence}% match ({candidate.matchedFields.join(", ")})
                </span>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a href={`/customers/${candidate.customerId}`}>View them</a>
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              onClick={() => {
                if (acknowledgeDuplicatesRef.current) acknowledgeDuplicatesRef.current.value = "true"
              }}
            >
              Not a duplicate — save anyway
            </Button>
          </div>
        </div>
      )}

      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <SubmitButton
          type="submit"
          size="sm"
          status={isPending ? (isSlowPending ? "slow" : "pending") : justSaved ? "saved" : "idle"}
        >
          Save
        </SubmitButton>
      </div>
    </form>
  )
}

export { CustomerEditForm }
