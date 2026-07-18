"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import type { Branch, VehicleDetail } from "@/types/rental"
import type { VehicleActionState } from "@/app/(dashboard)/fleet/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

interface VehicleFormProps {
  action: (prevState: VehicleActionState, formData: FormData) => Promise<VehicleActionState>
  branches: Branch[]
  vehicle?: VehicleDetail
}

const initialState: VehicleActionState = {}

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  )
}

function VehicleForm({ action, branches, vehicle }: VehicleFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState)

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
            defaultValue={vehicle?.plate}
            placeholder="e.g. 45871-A-6"
            required
          />
          <Field label="Make" name="make" defaultValue={vehicle?.make} placeholder="Dacia" required />
          <Field label="Model" name="model" defaultValue={vehicle?.model} placeholder="Duster" required />
          <Field label="Year" name="year" type="number" defaultValue={vehicle?.year} required />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <NativeSelect id="category" name="category" defaultValue={vehicle?.category ?? "economy"} required>
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
            defaultValue={vehicle?.dailyRateMad}
            required
          />
          <Field
            label="Deposit (MAD)"
            name="depositAmount"
            type="number"
            step="0.01"
            defaultValue={vehicle?.depositMad ?? undefined}
          />
          {branches.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="branchId">Branch</Label>
              <NativeSelect id="branchId" name="branchId" defaultValue={vehicle?.branchId ?? branches[0]?.id ?? ""}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
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

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {vehicle ? "Save changes" : "Add vehicle"}
        </Button>
      </div>
    </form>
  )
}

export { VehicleForm }
