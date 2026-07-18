"use client"

import { useActionState, useState } from "react"
import { Loader2, Pencil } from "lucide-react"

import { updateCustomerProfile, type CustomerActionState } from "@/app/(dashboard)/customers/actions"
import type { CustomerDetail } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: CustomerActionState = {}

function CustomerEditForm({ customer }: { customer: CustomerDetail }) {
  const [open, setOpen] = useState(false)
  const action = updateCustomerProfile.bind(null, customer.id)
  const [state, formAction, isPending] = useActionState(action, initialState)

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
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  )
}

export { CustomerEditForm }
