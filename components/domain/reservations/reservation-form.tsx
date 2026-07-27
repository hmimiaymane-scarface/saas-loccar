"use client"

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { Loader2, Search, UserRound, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react"

import type { Branch, Customer, ReservationSource, Vehicle, VehicleCategory, BookingStatus } from "@/types/rental"
import type { ReservationActionState } from "@/app/(dashboard)/reservations/actions"
import type { ReturningCustomerReadiness } from "@/lib/customer-readiness"
import { fetchCustomers, fetchAvailableVehicles, checkCustomerByPhone } from "@/app/(dashboard)/reservations/actions"
import { calculatePricing } from "@/lib/pricing"
import { zonedTimeToUtcIso, utcIsoToZonedLocal } from "@/lib/timezone"
import { formatMad } from "@/lib/format"
import { cn } from "@/lib/utils"
import { shouldAutoSelectSingleOption } from "@/lib/workflow/steps"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { SummaryRow } from "@/components/domain/summary-row"

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
  assignedEmployeeId?: string | null
}

export interface AssignableEmployee {
  userId: string
  fullName: string
}

interface ReservationFormProps {
  action: (prevState: ReservationActionState, formData: FormData) => Promise<ReservationActionState>
  companyTimezone: string
  branches: Branch[]
  defaultVehicleId?: string
  defaultDailyRate?: number
  defaultPickupDate?: string
  /** Productization wave 3 phase 20 — "reduce typing." A returning
   * customer's own most recent pickup/return location, or a
   * company-wide fallback for a first-time one; pre-fills the
   * otherwise-always-empty location fields. */
  defaultPickupLocation?: string
  defaultReturnLocation?: string
  /** Phase 20 — company-wide most common local pickup hour, replacing
   * the previously-hardcoded "10:00" when a real signal exists. */
  defaultPickupHour?: number
  /** Roadmap phase 09's Returning-Customer Fast Path — this customer's
   * most-rented category (phase 08's CLV `preferredCategory`), applied
   * as the initial category filter only when there's a preselected
   * customer and no explicit vehicle already chosen. */
  defaultCategory?: VehicleCategory
  initial?: ReservationFormInitial
  /** A customer who was just created through the standalone "Add
   * customer" flow (reached via a returnTo link from here), or who was
   * reached via the Customer Command Center's "Start rental" button,
   * and should come back pre-selected instead of making the user
   * search again. */
  preselectedCustomer?: Customer
  /** Set only alongside preselectedCustomer — the same fast-path
   * readiness check shown on the Customer Command Center, repeated
   * here so an interrupted case (expired/missing document) is visible
   * at the moment it actually matters, without blocking the form:
   * advisory only, same as every other AI/derived signal in this app. */
  returningCustomerReadiness?: ReturningCustomerReadiness
  /** Roadmap phase 16 — only owner/manager pages pass this; agents
   * never see the field at all (they can't assign work to themselves
   * or others, only be assigned). Empty/omitted means no assignment
   * picker renders — a reservation stays unassigned, visible to any
   * agent, exactly as before this field existed. */
  assignableEmployees?: AssignableEmployee[]
  /** Productization wave 3 phase 18 — set only by `NewRentalWizard`,
   * alongside the no-redirect `createReservationInWizard` action.
   * Fires when `state.reservationId` comes back populated (which only
   * that action ever sets) instead of the normal create/edit path's
   * own `redirect()`. `totalMad` is this component's own already-
   * computed `pricing.totalMad` at the moment of success — the server
   * action's result doesn't carry pricing back, so the wizard's next
   * (Payment) step reads it from here instead of re-deriving it. */
  onSuccess?: (reservationId: string, totalMad: number) => void
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
  defaultPickupLocation,
  defaultReturnLocation,
  defaultPickupHour,
  defaultCategory,
  initial,
  preselectedCustomer,
  returningCustomerReadiness,
  assignableEmployees = [],
  onSuccess,
}: ReservationFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState)
  const isEdit = Boolean(initial)

  // Auto-focus the first field on mount — the natural start of the
  // progression, without fighting the user once they're typing.
  const pickupRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!isEdit) pickupRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  // Customer -----------------------------------------------------------
  const [customerMode, setCustomerMode] = useState<"search" | "new">("search")
  const [customerQuery, setCustomerQuery] = useState("")
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(preselectedCustomer ?? null)
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
        ? `${defaultPickupDate}T${String(defaultPickupHour ?? 10).padStart(2, "0")}:00`
        : ""
  )
  const [returnLocal, setReturnLocal] = useState(
    initial ? utcIsoToZonedLocal(initial.returnAt, companyTimezone) : ""
  )
  const [pickupLocation, setPickupLocation] = useState(initial?.pickupLocation ?? defaultPickupLocation ?? "")
  const [returnLocation, setReturnLocation] = useState(initial?.returnLocation ?? defaultReturnLocation ?? "")
  const [branchId, setBranchId] = useState(initial?.branchId ?? branches[0]?.id ?? "")

  const pickupIso = pickupLocal ? zonedTimeToUtcIso(pickupLocal, companyTimezone) : null
  const returnIso = returnLocal ? zonedTimeToUtcIso(returnLocal, companyTimezone) : null
  const periodValid = Boolean(pickupIso && returnIso && new Date(returnIso) > new Date(pickupIso))

  // Vehicle --------------------------------------------------------------
  const [category, setCategory] = useState<string>(initial?.requestedCategory ?? defaultCategory ?? "")
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
  const pricingRef = useRef<HTMLDivElement>(null)
  const didMountVehicleSelect = useRef(false)

  function onSelectVehicle(v: Vehicle, opts: { scroll?: boolean } = {}) {
    setVehicleId(v.id)
    setUnassigned(false)
    setDailyRate(v.dailyRateMad)
    if (opts.scroll !== false) {
      pricingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  // When exactly one vehicle is available, pre-select it — but still show
  // it visibly selected in the grid, never hide the choice. Never applies
  // with more than one option, and never overrides an existing selection.
  useEffect(() => {
    if (!shouldAutoSelectSingleOption(availableVehicles.length, Boolean(vehicleId) || unassigned)) return
    const vehicle = availableVehicles[0]
    // Skip the scroll-into-view on the very first resolution (e.g. when
    // arriving here already knowing the vehicle) — only scroll for
    // selections that happen after the user is already looking at the form.
    const scroll = didMountVehicleSelect.current
    didMountVehicleSelect.current = true
    const timeout = setTimeout(() => onSelectVehicle(vehicle, { scroll }), 0)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the candidate list changes
  }, [availableVehicles])

  // Payments and deposits are recorded separately (reservation detail page
  // and the pickup/return workflow), never edited directly here — this
  // preview is base/discount/total only, not "paid so far".
  const pricing = useMemo(() => {
    if (!pickupIso || !returnIso) return null
    return calculatePricing({ dailyRateMad: dailyRate, pickupAt: pickupIso, returnAt: returnIso, discountMad })
  }, [pickupIso, returnIso, dailyRate, discountMad])

  useEffect(() => {
    if (state.reservationId && onSuccess) onSuccess(state.reservationId, pricing?.totalMad ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per successful submission, reading pricing's current value rather than re-firing when it changes
  }, [state.reservationId])

  // Details ----------------------------------------------------------------
  const [source, setSource] = useState<ReservationSource>("walk_in")
  const [status, setStatus] = useState<BookingStatus>("request")
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(initial?.assignedEmployeeId ?? "")

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
                <p className="text-xs text-muted-foreground">
                  Just name and phone is enough for now.{" "}
                  <Link href="/customers/new?returnTo=/reservations/new" className="text-foreground underline underline-offset-2">
                    Add a full customer record instead
                  </Link>
                  .
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isEdit && preselectedCustomer && returningCustomerReadiness && selectedCustomer?.id === preselectedCustomer.id && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm",
            returningCustomerReadiness.ready
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
          )}
        >
          {returningCustomerReadiness.ready ? (
            <Sparkles className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          )}
          <div className="flex flex-col gap-0.5">
            {returningCustomerReadiness.ready ? (
              <span>Returning customer, fast path — licence and ID are on file and valid.</span>
            ) : (
              <>
                <span>Returning customer — one thing needs attention before pickup:</span>
                <span>
                  {returningCustomerReadiness.issues
                    .map((issue) => {
                      switch (issue.type) {
                        case "licence_missing":
                          return "no driving licence expiry on file"
                        case "licence_expired":
                          return "driving licence has expired"
                        case "identity_missing":
                          return "no identity document on file"
                        case "identity_expired":
                          return "identity document has expired"
                      }
                    })
                    .join(" · ")}
                  {" — see "}
                  <Link href={`/customers/${preselectedCustomer.id}`} className="underline underline-offset-2">
                    the customer&apos;s profile
                  </Link>
                  {" to fix it. This doesn't block creating the reservation."}
                </span>
              </>
            )}
          </div>
        </div>
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
              ref={pickupRef}
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
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Checking availability…
                </p>
              ) : !periodValid ? null : availableVehicles.length === 0 ? (
                <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 px-3 py-2.5">
                  <p className="text-sm text-muted-foreground">
                    No vehicles available for this period{category ? " in this category" : ""}. Try different
                    dates, another category, or leave the reservation unassigned for now.
                  </p>
                  <div className="flex gap-2">
                    {category && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setCategory("")}>
                        Clear category
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => setUnassigned(true)}>
                      Leave unassigned
                    </Button>
                  </div>
                </div>
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

      <Card ref={pricingRef}>
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
            {assignableEmployees.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assignedEmployeeId">Assign to</Label>
                <NativeSelect
                  id="assignedEmployeeId"
                  name="assignedEmployeeId"
                  value={assignedEmployeeId ?? ""}
                  onChange={(e) => setAssignedEmployeeId(e.target.value)}
                >
                  <option value="">Unassigned — visible to any agent</option>
                  {assignableEmployees.map((e) => (
                    <option key={e.userId} value={e.userId}>
                      {e.fullName}
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

      {canSubmit && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>Check the details before {isEdit ? "saving" : "creating the reservation"}.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SummaryRow
              label="Customer"
              value={
                isEdit
                  ? (initial?.customer.fullName ?? "—")
                  : (selectedCustomer?.fullName || quickName || "Not selected")
              }
            />
            <SummaryRow
              label="Vehicle"
              value={
                vehicleId
                  ? (availableVehicles.find((v) => v.id === vehicleId)?.make
                      ? `${availableVehicles.find((v) => v.id === vehicleId)?.make} ${availableVehicles.find((v) => v.id === vehicleId)?.model}`
                      : (initial?.vehicleLabel ?? "Selected"))
                  : `Unassigned${category ? ` (${category})` : ""}`
              }
            />
            <SummaryRow label="Pickup" value={pickupLocal ? pickupLocal.replace("T", " ") : "—"} />
            <SummaryRow label="Return" value={returnLocal ? returnLocal.replace("T", " ") : "—"} />
            {pricing && <SummaryRow label="Total price" value={formatMad(pricing.totalMad)} />}
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
          {isEdit ? "Save changes" : "Create reservation"}
        </Button>
      </div>
    </form>
  )
}

export { ReservationForm }
