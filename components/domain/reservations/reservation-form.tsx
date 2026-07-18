"use client"

import { useActionState, useEffect, useMemo, useState, useTransition } from "react"
import { Loader2, Search, UserRound, AlertTriangle, CheckCircle2 } from "lucide-react"

import type { Branch, Customer, ReservationSource, Vehicle, VehicleCategory, BookingStatus } from "@/types/rental"
import type { ReservationActionState } from "@/app/(dashboard)/reservations/actions"
import { fetchCustomers, fetchAvailableVehicles, checkCustomerByPhone } from "@/app/(dashboard)/reservations/actions"
import { calculatePricing } from "@/lib/pricing"
import { zonedTimeToUtcIso, utcIsoToZonedLocal } from "@/lib/timezone"
import { formatMad } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const CATEGORY_OPTIONS: { value: VehicleCategory; label: string }[] = [
  { value: "economy", label: "Economy" },
  { value: "compact", label: "Compact" },
  { value: "suv", label: "SUV" },
  { value: "van", label: "Van" },
  { value: "luxury", label: "Luxury" },
]

const SOURCE_OPTIONS: { value: ReservationSource; label: string }[] = [
  { value: "walk_in", label: "Walk-in" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "website", label: "Website" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
]

const STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: "request", label: "Request (unconfirmed)" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
]

export interface ReservationFormInitial {
  reservationId: string
  customer: { id: string; fullName: string; phone: string }
  vehicleId: string | null
  vehicleLabel: string | null
  requestedCategory: VehicleCategory | null
  branchId: string | null
  pickupAt: string
  returnAt: string
  pickupLocation: string
  returnLocation: string
  dailyRateMad: number
  discountMad: number
  notes: string | null
}

interface ReservationFormProps {
  action: (prevState: ReservationActionState, formData: FormData) => Promise<ReservationActionState>
  companyTimezone: string
  branches: Branch[]
  defaultVehicleId?: string
  defaultDailyRate?: number
  defaultPickupDate?: string
  initial?: ReservationFormInitial
}

const initialState: ReservationActionState = {}

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

function ReservationForm({
  action,
  companyTimezone,
  branches,
  defaultVehicleId,
  defaultDailyRate,
  defaultPickupDate,
  initial,
}: ReservationFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState)
  const isEdit = Boolean(initial)

  // Customer -----------------------------------------------------------
  const [customerMode, setCustomerMode] = useState<"search" | "new">("search")
  const [customerQuery, setCustomerQuery] = useState("")
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [quickName, setQuickName] = useState("")
  const [quickPhone, setQuickPhone] = useState("")
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null)
  const [, startCustomerSearch] = useTransition()
  const [, startDuplicateCheck] = useTransition()

  useEffect(() => {
    if (customerMode !== "search") return
    const timeout = setTimeout(() => {
      startCustomerSearch(async () => {
        const results = await fetchCustomers(customerQuery)
        setCustomerResults(results)
      })
    }, 250)
    return () => clearTimeout(timeout)
  }, [customerQuery, customerMode])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (customerMode !== "new" || quickPhone.trim().length < 6) {
        setDuplicateCustomer(null)
        return
      }
      startDuplicateCheck(async () => {
        const existing = await checkCustomerByPhone(quickPhone)
        setDuplicateCustomer(existing)
      })
    }, 400)
    return () => clearTimeout(timeout)
  }, [quickPhone, customerMode])

  // Rental period --------------------------------------------------------
  const [pickupLocal, setPickupLocal] = useState(
    initial
      ? utcIsoToZonedLocal(initial.pickupAt, companyTimezone)
      : defaultPickupDate
        ? `${defaultPickupDate}T10:00`
        : ""
  )
  const [returnLocal, setReturnLocal] = useState(
    initial ? utcIsoToZonedLocal(initial.returnAt, companyTimezone) : ""
  )
  const [pickupLocation, setPickupLocation] = useState(initial?.pickupLocation ?? "")
  const [returnLocation, setReturnLocation] = useState(initial?.returnLocation ?? "")
  const [branchId, setBranchId] = useState(initial?.branchId ?? branches[0]?.id ?? "")

  const pickupIso = pickupLocal ? zonedTimeToUtcIso(pickupLocal, companyTimezone) : null
  const returnIso = returnLocal ? zonedTimeToUtcIso(returnLocal, companyTimezone) : null
  const periodValid = Boolean(pickupIso && returnIso && new Date(returnIso) > new Date(pickupIso))

  // Vehicle --------------------------------------------------------------
  const [category, setCategory] = useState<string>(initial?.requestedCategory ?? "")
  const [vehicleId, setVehicleId] = useState<string | null>(
    initial?.vehicleId ?? defaultVehicleId ?? null
  )
  const [unassigned, setUnassigned] = useState(Boolean(initial && !initial.vehicleId))
  const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>([])
  const [vehiclesLoading, setVehiclesLoading] = useState(false)
  const [, startVehicleFetch] = useTransition()

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!periodValid || !pickupIso || !returnIso) {
        setAvailableVehicles([])
        return
      }
      setVehiclesLoading(true)
      startVehicleFetch(async () => {
        const vehicles = await fetchAvailableVehicles(pickupIso, returnIso, category, initial?.reservationId)
        setAvailableVehicles(vehicles)
        setVehiclesLoading(false)
      })
    }, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupIso, returnIso, category, periodValid])

  // Pricing ----------------------------------------------------------------
  const [dailyRate, setDailyRate] = useState<number>(initial?.dailyRateMad ?? defaultDailyRate ?? 0)
  const [discountMad, setDiscountMad] = useState<number>(initial?.discountMad ?? 0)

  function onSelectVehicle(v: Vehicle) {
    setVehicleId(v.id)
    setUnassigned(false)
    setDailyRate(v.dailyRateMad)
  }

  // Payments and deposits are recorded separately (reservation detail page
  // and the pickup/return workflow), never edited directly here — this
  // preview is base/discount/total only, not "paid so far".
  const pricing = useMemo(() => {
    if (!pickupIso || !returnIso) return null
    return calculatePricing({ dailyRateMad: dailyRate, pickupAt: pickupIso, returnAt: returnIso, discountMad })
  }, [pickupIso, returnIso, dailyRate, discountMad])

  // Details ----------------------------------------------------------------
  const [source, setSource] = useState<ReservationSource>("walk_in")
  const [status, setStatus] = useState<BookingStatus>("request")
  const [notes, setNotes] = useState(initial?.notes ?? "")

  const canSubmit = periodValid && (vehicleId || (unassigned && category))

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="pickupAt" value={pickupLocal} />
      <input type="hidden" name="returnAt" value={returnLocal} />
      <input type="hidden" name="vehicleId" value={vehicleId ?? ""} />
      <input type="hidden" name="requestedCategory" value={unassigned ? category : ""} />
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="pickupLocation" value={pickupLocation} />
      <input type="hidden" name="returnLocation" value={returnLocation} />
      {!isEdit && customerMode === "search" && selectedCustomer && (
        <input type="hidden" name="customerId" value={selectedCustomer.id} />
      )}

      {!isEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={customerMode === "search" ? "default" : "outline"}
                size="sm"
                onClick={() => setCustomerMode("search")}
              >
                Existing customer
              </Button>
              <Button
                type="button"
                variant={customerMode === "new" ? "default" : "outline"}
                size="sm"
                onClick={() => setCustomerMode("new")}
              >
                New customer
              </Button>
            </div>

            {customerMode === "search" ? (
              selectedCustomer ? (
                <div className="flex items-center justify-between rounded-2xl border border-border px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                      <UserRound className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col">
                      <p className="text-sm font-medium text-foreground">{selectedCustomer.fullName}</p>
                      <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                      placeholder="Search by name or phone…"
                      className="pl-9"
                    />
                  </div>
                  {customerResults.length > 0 && (
                    <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
                      {customerResults.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => setSelectedCustomer(c)}
                          className="flex flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted"
                        >
                          <span className="text-sm font-medium text-foreground">{c.fullName}</span>
                          <span className="text-xs text-muted-foreground">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="quickCustomerName">Full name</Label>
                    <Input
                      id="quickCustomerName"
                      name="quickCustomerName"
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="quickCustomerPhone">Phone</Label>
                    <Input
                      id="quickCustomerPhone"
                      name="quickCustomerPhone"
                      value={quickPhone}
                      onChange={(e) => setQuickPhone(e.target.value)}
                      placeholder="+212 6XX-XXXXXX"
                      required
                    />
                  </div>
                </div>
                {duplicateCustomer && (
                  <div className="flex items-center justify-between rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="size-4 shrink-0" />
                      Already a customer: {duplicateCustomer.fullName}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCustomerMode("search")
                        setSelectedCustomer(duplicateCustomer)
                      }}
                    >
                      Use them
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isEdit && initial && (
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
            <CardDescription>Change the customer from the reservation list if needed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                <UserRound className="size-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col">
                <p className="text-sm font-medium text-foreground">{initial.customer.fullName}</p>
                <p className="text-xs text-muted-foreground">{initial.customer.phone}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rental period</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pickupLocal">Pickup</Label>
            <Input
              id="pickupLocal"
              type="datetime-local"
              value={pickupLocal}
              onChange={(e) => setPickupLocal(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="returnLocal">Return</Label>
            <Input
              id="returnLocal"
              type="datetime-local"
              value={returnLocal}
              onChange={(e) => setReturnLocal(e.target.value)}
              required
            />
          </div>
          {pickupLocal && returnLocal && !periodValid && (
            <p className="text-sm text-destructive sm:col-span-2">Return must be after pickup.</p>
          )}
          <Field
            label="Pickup location"
            name="pickupLocationDisplay"
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
            placeholder="Agency, airport…"
          />
          <Field
            label="Return location"
            name="returnLocationDisplay"
            value={returnLocation}
            onChange={(e) => setReturnLocation(e.target.value)}
            placeholder="Agency, airport…"
          />
          {branches.length > 1 && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="branchIdDisplay">Branch</Label>
              <NativeSelect id="branchIdDisplay" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
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
          <CardTitle>Vehicle</CardTitle>
          <CardDescription>
            {periodValid ? "Available vehicles for this period" : "Choose pickup and return times to see availability"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <NativeSelect className="w-44" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Any category</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={unassigned}
                onChange={(e) => {
                  setUnassigned(e.target.checked)
                  if (e.target.checked) setVehicleId(null)
                }}
                className="size-4 rounded border-border"
              />
              Leave unassigned for now (request only)
            </label>
          </div>

          {!unassigned && (
            <>
              {vehiclesLoading ? (
                <p className="text-sm text-muted-foreground">Checking availability…</p>
              ) : !periodValid ? null : availableVehicles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No vehicles available for this period{category ? " in this category" : ""}. Try different dates,
                  another category, or leave the reservation unassigned.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableVehicles.map((v) => (
                    <button
                      type="button"
                      key={v.id}
                      onClick={() => onSelectVehicle(v)}
                      className={cn(
                        "flex flex-col gap-1 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                        vehicleId === v.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {v.make} {v.model}
                        </span>
                        {vehicleId === v.id && <CheckCircle2 className="size-4 text-primary" />}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {v.plate} · {v.category} · {formatMad(v.dailyRateMad)}/day
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {initial?.vehicleLabel && vehicleId === initial.vehicleId && (
                <p className="text-xs text-muted-foreground">Currently assigned: {initial.vehicleLabel}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dailyRate">Daily rate (MAD)</Label>
              <Input
                id="dailyRate"
                name="dailyRate"
                type="number"
                step="0.01"
                value={dailyRate}
                onChange={(e) => setDailyRate(Number(e.target.value) || 0)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discountMad">Discount (MAD)</Label>
              <Input
                id="discountMad"
                name="discountMad"
                type="number"
                step="0.01"
                value={discountMad}
                onChange={(e) => setDiscountMad(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {pricing && (
            <div className="flex flex-col gap-1.5 rounded-2xl bg-muted p-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>
                  {pricing.numDays} day{pricing.numDays === 1 ? "" : "s"} × {formatMad(dailyRate)}
                </span>
                <span>{formatMad(pricing.baseAmountMad)}</span>
              </div>
              {pricing.discountMad > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span>-{formatMad(pricing.discountMad)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between font-medium text-foreground">
                <span>Total</span>
                <span>{formatMad(pricing.totalMad)}</span>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Payments and the deposit are recorded from the reservation page after it&apos;s created.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="source">Source</Label>
              <NativeSelect
                id="source"
                name="source"
                value={source}
                onChange={(e) => setSource(e.target.value as ReservationSource)}
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {!isEdit && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="status">Initial status</Label>
                <NativeSelect
                  id="status"
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as BookingStatus)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Internal notes</Label>
            <textarea
              id="notes"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
          </div>
        </CardContent>
      </Card>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending || !canSubmit}>
          {isPending && <Loader2 className="animate-spin" />}
          {isEdit ? "Save changes" : "Create reservation"}
        </Button>
      </div>
    </form>
  )
}

export { ReservationForm }
