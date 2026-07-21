"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, AlertTriangle } from "lucide-react"

import { createCustomer, type CustomerActionState } from "@/app/(dashboard)/customers/actions"
import { SummaryRow } from "@/components/domain/summary-row"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

const initialState: CustomerActionState = {}

function Field({
  label,
  name,
  inputRef,
  ...props
}: { label: string; name: string; inputRef?: React.Ref<HTMLInputElement> } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input ref={inputRef} id={name} name={name} {...props} />
    </div>
  )
}

/** Standalone guided customer creation — Basic identity, Contact, ID
 * document, Driving licence, Review. Only name and phone are required;
 * the rest is clearly marked optional, matching the brief's "don't
 * require unnecessary information before a reservation can be created."
 * The quick two-field customer creation embedded in the reservation form
 * stays as-is and is unaffected by this page. */
function CustomerForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(async (prev: CustomerActionState, formData: FormData) => {
    const result = await createCustomer(prev, formData)
    if (result.customerId) {
      router.push(returnTo ? `${returnTo}?customerId=${result.customerId}` : `/customers/${result.customerId}`)
    }
    return result
  }, initialState)

  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const acknowledgeDuplicatesRef = useRef<HTMLInputElement>(null)

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            name="fullName"
            inputRef={nameRef}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Youssef El Amrani"
            required
          />
          <Field label="Nationality" name="nationality" placeholder="Optional" />
          <Field label="Date of birth" name="dateOfBirth" type="date" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Phone"
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+212 6XX-XXXXXX"
            required
          />
          <Field label="Email" name="email" type="email" placeholder="Optional" />
          <div className="sm:col-span-2">
            <Field label="Address" name="address" placeholder="Optional" />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input type="checkbox" name="marketingConsent" value="true" className="size-4 rounded border-input" />
            Customer has consented to marketing communications
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identification document</CardTitle>
          <CardDescription>Optional — you can add this later.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="ID document number" name="idDocumentNumber" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Driving licence</CardTitle>
          <CardDescription>Optional — you can add this later.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Licence number" name="licenseNumber" />
          <Field label="Licence expires" name="licenseExpiresOn" type="date" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <SummaryRow label="Name" value={fullName || "Not entered"} />
          <SummaryRow label="Phone" value={phone || "Not entered"} />
        </CardContent>
      </Card>

      <input ref={acknowledgeDuplicatesRef} type="hidden" name="acknowledgeDuplicates" defaultValue="false" />

      {/* Duplicate candidates (roadmap phase 04 requirement 5, extended by
          phase 08 requirement 3 to also match phone/email/birth date) —
          never blocks: the bible's flow is Merge / Keep Separate / Review
          Later, so the form offers "use them" per candidate plus a way
          to acknowledge and create anyway. */}
      {state.duplicateCandidates && state.duplicateCandidates.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            This might already be a customer
          </span>
          <ul className="flex flex-col gap-1.5">
            {state.duplicateCandidates.map((candidate) => (
              <li key={candidate.customerId} className="flex items-center justify-between gap-3">
                <span>
                  {candidate.fullName} — {candidate.confidence}% match ({candidate.matchedFields.join(", ")})
                </span>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a href={returnTo ? `${returnTo}?customerId=${candidate.customerId}` : `/customers/${candidate.customerId}`}>
                    Use them
                  </a>
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
              Not a duplicate — create anyway
            </Button>
          </div>
        </div>
      )}

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending || !fullName.trim() || !phone.trim()}>
          {isPending && <Loader2 className="animate-spin" />}
          Add customer
        </Button>
      </div>
    </form>
  )
}

export { CustomerForm }
