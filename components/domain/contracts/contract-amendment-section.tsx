"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus } from "lucide-react"

import { createAmendmentAction } from "@/app/(dashboard)/contract-templates/actions"
import type { AmendmentType } from "@/lib/contracts/template-store"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Collapsible } from "@/components/ui/collapsible"

const AMENDMENT_LABELS: Record<AmendmentType, string> = {
  rental_extension: "Rental extension",
  vehicle_exchange: "Vehicle exchange",
  additional_driver: "Additional driver",
  price_adjustment: "Price adjustment",
  insurance_upgrade: "Insurance upgrade",
}

interface AmendmentItem {
  id: string
  type: AmendmentType
  description: string
  changes: { field: string; before: string; after: string }[]
  createdByName: string | null
  createdAt: string
}

/**
 * Roadmap phase 11 requirement 5 — amendments are their own append-only
 * record, never a change to the original contract (see
 * `createContractAmendment`'s doc comment and the immutability test in
 * `lib/contracts/__tests__/template-store.test.ts`). This UI is the
 * one place that record is created and displayed; the original
 * contract's own sections/PDF above are never re-rendered from it.
 */
function ContractAmendmentSection({ contractId, amendments }: { contractId: string; amendments: AmendmentItem[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<AmendmentType>("rental_extension")
  const [description, setDescription] = useState("")
  const [field, setField] = useState("")
  const [before, setBefore] = useState("")
  const [after, setAfter] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!description.trim()) return
    setError(null)
    startTransition(async () => {
      const changes = field.trim() ? [{ field: field.trim(), before: before.trim(), after: after.trim() }] : []
      const result = await createAmendmentAction({ contractId, type, description: description.trim(), changes })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      setDescription("")
      setField("")
      setBefore("")
      setAfter("")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>Amendments</CardTitle>
          <CardDescription>Never changes the original contract — each one is its own record.</CardDescription>
        </div>
        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plus />
            Add amendment
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {amendments.length === 0 && !open && <p className="text-sm text-muted-foreground">No amendments recorded.</p>}

        {amendments.map((a) => (
          <div key={a.id} className="flex flex-col gap-1 rounded-2xl border border-border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{AMENDMENT_LABELS[a.type]}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
            </div>
            <p className="text-sm text-muted-foreground">{a.description}</p>
            {a.changes.length > 0 && (
              <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                {a.changes.map((c, i) => (
                  <span key={i}>
                    {c.field}: {c.before} → {c.after}
                  </span>
                ))}
              </div>
            )}
            {a.createdByName && <span className="text-xs text-muted-foreground">by {a.createdByName}</span>}
          </div>
        ))}

        <Collapsible open={open}>
          <div className="flex flex-col gap-3">
            {amendments.length > 0 && <Separator className="mb-1" />}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amendmentType">Type</Label>
              <NativeSelect id="amendmentType" value={type} onChange={(e) => setType(e.target.value as AmendmentType)}>
                {Object.entries(AMENDMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amendmentDescription">Description</Label>
              <Input id="amendmentDescription" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Extended by 2 days at the customer's request" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amendmentField">Field changed (optional)</Label>
                <Input id="amendmentField" value={field} onChange={(e) => setField(e.target.value)} placeholder="e.g. Return date" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amendmentBefore">Before</Label>
                <Input id="amendmentBefore" value={before} onChange={(e) => setBefore(e.target.value)} disabled={!field.trim()} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amendmentAfter">After</Label>
                <Input id="amendmentAfter" value={after} onChange={(e) => setAfter(e.target.value)} disabled={!field.trim()} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !description.trim()} onClick={submit}>
                {pending && <Loader2 className="animate-spin" />}
                Save amendment
              </Button>
            </div>
          </div>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

export { ContractAmendmentSection }
