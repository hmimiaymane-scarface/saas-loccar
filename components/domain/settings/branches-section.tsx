"use client"

import { useActionState, useState } from "react"
import { Loader2, Pencil, Plus, MapPin } from "lucide-react"

import { createBranch, updateBranch, type SettingsActionState } from "@/app/(dashboard)/settings/actions"
import type { Branch } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

const initialState: SettingsActionState = {}

function BranchFields({ branch }: { branch?: Branch }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={branch?.name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="city">City</Label>
        <Input id="city" name="city" defaultValue={branch?.city ?? undefined} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" />
      </div>
    </div>
  )
}

function EditBranchRow({ branch }: { branch: Branch }) {
  const [open, setOpen] = useState(false)
  const action = updateBranch.bind(null, branch.id)
  const [state, formAction, isPending] = useActionState(action, initialState)

  if (!open) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-border p-3">
        <div className="flex items-center gap-2.5">
          <MapPin className="size-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              {branch.name} {branch.isMain && <span className="text-xs text-muted-foreground">(main)</span>}
            </span>
            {branch.city && <span className="text-xs text-muted-foreground">{branch.city}</span>}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <BranchFields branch={branch} />
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

function AddBranchForm() {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState(createBranch, initialState)

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add branch
      </Button>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-3">
      <BranchFields />
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Add
        </Button>
      </div>
    </form>
  )
}

/** Most companies have exactly one branch, so this section stays compact
 * and out of the way when there's nothing to manage — see the phase
 * brief's "do not force branch complexity" for single-branch companies. */
function BranchesSection({ branches }: { branches: Branch[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Branches</CardTitle>
        <CardDescription>
          {branches.length <= 1 ? "One location — add more only if you actually operate from several." : `${branches.length} locations`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {branches.map((b) => (
          <EditBranchRow key={b.id} branch={b} />
        ))}
        <AddBranchForm />
      </CardContent>
    </Card>
  )
}

export { BranchesSection }
