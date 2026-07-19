"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import type { Branch, VehicleCategory, VehicleDetail } from "@/types/rental"
import type { VehicleActionState } from "@/app/(dashboard)/fleet/actions"
import { formatMad } from "@/lib/format"
import { SummaryRow } from "@/components/domain/summary-row"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

const CATEGORY_LABELS: Record<string, string> = {
  economy: "Economy",
  compact: "Compact",
  suv: "SUV",
  van: "Van",
  luxury: "Luxury",
}

interface VehicleFormProps {
  action: (prevState: VehicleActionState, formData: FormData) => Promise<VehicleActionState>
  branches: Branch[]
  vehicle?: VehicleDetail
}

const initialState: VehicleActionState = {}

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

function VehicleForm({ action, branches, vehicle }: VehicleFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState)

  const firstFieldRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  // Only the handful of fields the live summary needs are controlled —
  // everything else stays uncontrolled (defaultValue) like the rest of
  // this codebase's simple forms.
  const [registrationNumber, setRegistrationNumber] = useState(vehicle?.plate ?? "")
  const [make, setMake] = useState(vehicle?.make ?? "")
  const [model, setModel] = useState(vehicle?.model ?? "")
  const [category, setCategory] = useState<VehicleCategory>(vehicle?.category ?? "economy")
  const [dailyRate, setDailyRate] = useState<number | "">(vehicle?.dailyRateMad ?? "")
  const singleBranch = branches.length === 1 ? branches[0] : null
  const [branchId, setBranchId] = useState(vehicle?.branchId ?? branches[0]?.id ?? "")

  const canSubmit = registrationNumber.trim().length > 0 && make.trim().length > 0 && model.trim().length > 0

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Registration number"
            name="registrationNumber"
            inputRef={firstFieldRef}
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            placeholder="e.g. 45871-A-6"
            required
          />
          <Field label="Make" name="make" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Dacia" required />
          <Field label="Model" name="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Duster" required />
          <Field label="Year" name="year" type="number" defaultValue={vehicle?.year} required />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <NativeSelect id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value as VehicleCategory)} required>
              <option value="economy">Economy</option>
              <option value="compact">Compact</option>
              <option value="suv">SUV</option>
              <option value="van">Van</option>
              <option value="luxury">Luxury</option>
            </NativeSelect>
          </div>
          <Field label="Color" name="color" defaultValue={vehicle?.color ?? undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Specifications</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fuelType">Fuel type</Label>
            <NativeSelect id="fuelType" name="fuelType" defaultValue={vehicle?.fuelType ?? "petrol"} required>
              <option value="petrol">Petrol</option>
              <option value="diesel">Diesel</option>
              <option value="hybrid">Hybrid</option>
              <option value="electric">Electric</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transmission">Transmission</Label>
            <NativeSelect id="transmission" name="transmission" defaultValue={vehicle?.transmission ?? "manual"} required>
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </NativeSelect>
          </div>
          <Field label="Seats" name="seats" type="number" defaultValue={vehicle?.seats ?? undefined} />
          <Field label="Odometer (km)" name="odometerKm" type="number" defaultValue={vehicle?.mileageKm ?? 0} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing &amp; branch</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Daily rate (MAD)"
            name="dailyRate"
            type="number"
            step="0.01"
            value={dailyRate}
            onChange={(e) => setDailyRate(e.target.value === "" ? "" : Number(e.target.value))}
            required
          />
          <Field
            label="Deposit (MAD)"
            name="depositAmount"
            type="number"
            step="0.01"
            defaultValue={vehicle?.depositMad ?? undefined}
          />
          {branches.length > 1 ? (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="branchId">Branch</Label>
              <NativeSelect id="branchId" name="branchId" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            // A single branch (the normal case) is applied automatically
            // rather than shown as a one-option dropdown — see the phase
            // brief's "avoid asking the user to repeatedly choose it."
            singleBranch && <input type="hidden" name="branchId" value={singleBranch.id} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Optional — you can fill these in later.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Insurance expires"
            name="insuranceExpiresOn"
            type="date"
            defaultValue={vehicle?.insuranceExpiresOn ?? undefined}
          />
          <Field
            label="Registration expires"
            name="registrationExpiresOn"
            type="date"
            defaultValue={vehicle?.registrationExpiresOn ?? undefined}
          />
          <Field
            label="Inspection expires"
            name="inspectionExpiresOn"
            type="date"
            defaultValue={vehicle?.inspectionExpiresOn ?? undefined}
          />
        </CardContent>
      </Card>

      {canSubmit && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SummaryRow label="Vehicle" value={`${make} ${model}`.trim() || "—"} />
            <SummaryRow label="Registration" value={registrationNumber || "—"} />
            <SummaryRow label="Category" value={CATEGORY_LABELS[category] ?? category} />
            <SummaryRow label="Daily rate" value={dailyRate === "" ? "—" : formatMad(Number(dailyRate))} />
            <SummaryRow
              label="Branch"
              value={singleBranch?.name ?? branches.find((b) => b.id === branchId)?.name ?? "—"}
            />
          </CardContent>
        </Card>
      )}

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending || !canSubmit}>
          {isPending && <Loader2 className="animate-spin" />}
          {vehicle ? "Save changes" : "Add vehicle"}
        </Button>
      </div>
    </form>
  )
}

export { VehicleForm }
