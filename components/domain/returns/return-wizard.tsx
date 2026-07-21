"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, AlertTriangle, CheckCircle2, Plus, Gauge } from "lucide-react"

import type {
  ChecklistResponseValue,
  ChecklistTemplateItem,
  Cleanliness,
  Damage,
  FuelLevel,
  OverallCondition,
  PaymentMethod,
  ReservationDetail,
} from "@/types/rental"

type VehicleOutcome = "available" | "maintenance" | "unavailable"
import { formatMad, formatDate } from "@/lib/format"
import {
  startInspection,
  saveInspectionFields,
  saveChecklistResponse,
  attachInspectionMedia,
  completeInspectionAction,
} from "@/app/(dashboard)/inspections/actions"
import { completeRentalAction } from "@/app/(dashboard)/reservations/actions"
import { recordPayment, returnDeposit, retainDeposit } from "@/app/(dashboard)/payments/actions"
import { createDamage } from "@/app/(dashboard)/damages/actions"
import { isValidReturnOdometer, missingRequiredPhotoSlots } from "@/lib/inspections/rules"
import { PHOTO_SLOTS } from "@/lib/inspections/photo-slots"
import { resolveInitialStep, type RequirementItem } from "@/lib/workflow/steps"
import { useStepFocus } from "@/hooks/use-step-focus"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { WizardProgress } from "@/components/domain/wizard-progress"
import { WizardFooter } from "@/components/domain/wizard-footer"
import { SummaryRow } from "@/components/domain/summary-row"
import { RequirementsSummary } from "@/components/domain/requirements-summary"
import { SegmentedSelector } from "@/components/domain/inspections/segmented-selector"
import { ChecklistSection } from "@/components/domain/inspections/checklist-section"
import { PhotoUploadGrid, type UploadedPhoto } from "@/components/domain/photo-upload-grid"

const STEPS = [
  { label: "Return details" },
  { label: "Inspection" },
  { label: "Damage" },
  { label: "Charges & deposit" },
  { label: "Complete" },
]

const FUEL_OPTIONS: { value: FuelLevel; label: string }[] = [
  { value: "empty", label: "Empty" },
  { value: "quarter", label: "¼" },
  { value: "half", label: "½" },
  { value: "three_quarter", label: "¾" },
  { value: "full", label: "Full" },
]

const CLEANLINESS_OPTIONS: { value: Cleanliness; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "average", label: "Average" },
  { value: "dirty", label: "Dirty" },
]

const CONDITION_OPTIONS: { value: OverallCondition; label: string }[] = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
]

const OUTCOME_OPTIONS: { value: VehicleOutcome; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "maintenance", label: "Maintenance" },
  { value: "unavailable", label: "Unavailable" },
]

interface ReturnWizardProps {
  reservation: ReservationDetail
  companyId: string
  checklistTemplate: ChecklistTemplateItem[]
  vehicleDamages: Damage[]
  canOverride: boolean
}

function ReturnWizard({ reservation, companyId, checklistTemplate, vehicleDamages, canOverride }: ReturnWizardProps) {
  const router = useRouter()
  // Resume at the first incomplete step after a refresh. "Return
  // details" has no field of its own to persist, so its only signal is
  // whether a return inspection draft already existed when this page
  // loaded (meaning a previous visit got at least that far); "Damage" is
  // optional and never blocks resuming further in.
  const [step, setStep] = useState(() =>
    resolveInitialStep([
      Boolean(reservation.returnInspection),
      Boolean(
        reservation.returnInspection?.odometerKm != null &&
          reservation.returnInspection?.fuelLevel &&
          reservation.returnInspection?.cleanliness &&
          reservation.returnInspection?.overallCondition
      ),
      true,
      reservation.payment.remainingMad <= 0,
      false,
    ])
  )
  const stepContainerRef = useStepFocus<HTMLDivElement>(step)
  const [isPending, startTransition] = useTransition()
  const [stepError, setStepError] = useState<string | null>(null)

  const pickup = reservation.pickupInspection

  // Return details -----------------------------------------------------------
  const [returnNotes, setReturnNotes] = useState("")

  // Inspection ------------------------------------------------------------
  const [inspectionId, setInspectionId] = useState<string | null>(reservation.returnInspection?.id ?? null)
  const [odometerKm, setOdometerKm] = useState<string>(
    reservation.returnInspection?.odometerKm != null ? String(reservation.returnInspection.odometerKm) : ""
  )
  const [fuelLevel, setFuelLevel] = useState<FuelLevel | null>(reservation.returnInspection?.fuelLevel ?? null)
  const [cleanliness, setCleanliness] = useState<Cleanliness | null>(reservation.returnInspection?.cleanliness ?? null)
  const [overallCondition, setOverallCondition] = useState<OverallCondition | null>(
    reservation.returnInspection?.overallCondition ?? null
  )
  const [inspectionNotes, setInspectionNotes] = useState(reservation.returnInspection?.notes ?? "")
  const [responses, setResponses] = useState<Record<string, ChecklistResponseValue>>(() => {
    const initial: Record<string, ChecklistResponseValue> = {}
    for (const r of reservation.returnInspection?.checklist ?? []) initial[r.itemKey] = r.response
    return initial
  })
  const [photos, setPhotos] = useState<UploadedPhoto[]>(
    (reservation.returnInspection?.media ?? []).map((m) => ({ key: m.caption ?? m.id }))
  )

  useEffect(() => {
    if (inspectionId) return
    startTransition(async () => {
      const result = await startInspection(reservation.id, "return")
      if (result.inspectionId) setInspectionId(result.inspectionId)
      else if (result.error) setStepError(result.error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const distanceDrivenKm =
    pickup?.odometerKm != null && odometerKm ? Number(odometerKm) - pickup.odometerKm : null
  const odometerBelowPickup =
    odometerKm !== "" && !isValidReturnOdometer(Number(odometerKm), pickup?.odometerKm ?? null)
  const plannedReturn = new Date(reservation.returnAt)
  const isLate = new Date() > plannedReturn

  // Damage ------------------------------------------------------------------
  const [showDamageForm, setShowDamageForm] = useState(false)
  const [damageArea, setDamageArea] = useState("")
  const [damageDescription, setDamageDescription] = useState("")
  const [newDamages, setNewDamages] = useState<Damage[]>([])

  async function submitDamage() {
    if (!damageArea.trim() || !damageDescription.trim()) {
      setStepError("Describe the area and the damage.")
      return
    }
    setStepError(null)
    const formData = new FormData()
    formData.set("vehicleId", reservation.vehicle?.id ?? "")
    formData.set("reservationId", reservation.id)
    if (inspectionId) formData.set("discoveredInInspectionId", inspectionId)
    formData.set("category", "bodywork")
    formData.set("severity", "minor")
    formData.set("vehicleArea", damageArea)
    formData.set("description", damageDescription)
    formData.set("preExisting", "false")
    const result = await createDamage({}, formData)
    if (result.error) {
      setStepError(result.error)
      return
    }
    setNewDamages((prev) => [
      {
        id: result.damageId!,
        vehicleId: reservation.vehicle?.id ?? "",
        vehicleLabel: reservation.vehicle ? `${reservation.vehicle.make} ${reservation.vehicle.model}` : "",
        reservationId: reservation.id,
        reservationReference: reservation.reference,
        discoveredInInspectionId: inspectionId,
        status: "newly_discovered",
        category: "bodywork",
        vehicleArea: damageArea,
        severity: "minor",
        description: damageDescription,
        preExisting: false,
        estimatedCostMad: null,
        actualCostMad: null,
        createdByName: null,
        createdAt: new Date().toISOString(),
        media: [],
        source: "manual",
        aiConfidence: null,
      },
      ...prev,
    ])
    setDamageArea("")
    setDamageDescription("")
    setShowDamageForm(false)
  }

  // Charges & deposit --------------------------------------------------------
  const [payment, setPayment] = useState(reservation.payment)
  const [deposit, setDeposit] = useState(reservation.deposit)
  const [chargeAmount, setChargeAmount] = useState("")
  const [chargeType, setChargeType] = useState<"additional_charge" | "damage_charge">("additional_charge")
  const [chargeDescription, setChargeDescription] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [depositReturnAmount, setDepositReturnAmount] = useState("")
  const [depositRetainAmount, setDepositRetainAmount] = useState("")
  const [depositRetainReason, setDepositRetainReason] = useState("")

  async function submitCharge() {
    const amount = Number(chargeAmount)
    if (!amount || amount <= 0) {
      setStepError("Enter a charge amount.")
      return
    }
    setStepError(null)
    const formData = new FormData()
    formData.set("customerId", reservation.customer.id)
    formData.set("reservationId", reservation.id)
    formData.set("transactionType", chargeType)
    formData.set("amount", String(amount))
    formData.set("method", paymentMethod)
    formData.set("notes", chargeDescription)
    const result = await recordPayment({}, formData)
    if (result.error) {
      setStepError(result.error)
      return
    }
    setPayment((p) => ({
      ...p,
      totalDueMad: p.totalDueMad + amount,
      remainingMad: p.remainingMad + amount,
      status: "partial",
    }))
    setChargeAmount("")
    setChargeDescription("")
  }

  async function submitDepositReturn() {
    const amount = Number(depositReturnAmount)
    if (!amount || amount <= 0) {
      setStepError("Enter an amount to return.")
      return
    }
    setStepError(null)
    const result = await returnDeposit(reservation.id, amount, paymentMethod)
    if (result.error) {
      setStepError(result.error)
      return
    }
    setDeposit((d) => (d ? { ...d, returnedMad: d.returnedMad + amount } : d))
    setDepositReturnAmount("")
  }

  async function submitDepositRetain() {
    const amount = Number(depositRetainAmount)
    if (!amount || amount <= 0) {
      setStepError("Enter an amount to retain.")
      return
    }
    setStepError(null)
    const result = await retainDeposit(reservation.id, amount, depositRetainReason)
    if (result.error) {
      setStepError(result.error)
      return
    }
    setDeposit((d) => (d ? { ...d, retainedMad: d.retainedMad + amount } : d))
    setDepositRetainAmount("")
    setDepositRetainReason("")
  }

  // Review / completion --------------------------------------------------------
  const [vehicleOutcome, setVehicleOutcome] = useState<VehicleOutcome>("available")
  const [showOverride, setShowOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState("")

  const checklistIssues = useMemo(
    () => Object.values(responses).filter((r) => r === "damaged" || r === "missing").length,
    [responses]
  )

  async function saveInspectionStep() {
    if (!inspectionId) return
    setStepError(null)
    const result = await saveInspectionFields(inspectionId, {
      odometerKm: odometerKm ? Number(odometerKm) : undefined,
      fuelLevel: fuelLevel ?? undefined,
      cleanliness: cleanliness ?? undefined,
      overallCondition: overallCondition ?? undefined,
      notes: [inspectionNotes, returnNotes].filter(Boolean).join(" — ") || undefined,
    })
    if (result.error) {
      setStepError(result.error)
      return
    }
    setStep(2)
  }

  async function complete(reason?: string) {
    if (!inspectionId) return
    setStepError(null)

    const missingSlots = missingRequiredPhotoSlots(photos.map((p) => p.key))
    if (missingSlots.length > 0 && !reason) {
      const labels = missingSlots.map((key) => PHOTO_SLOTS.find((s) => s.key === key)?.label ?? key)
      setStepError(`Missing required photos: ${labels.join(", ")}.`)
      return
    }

    const completeResult = await completeInspectionAction(inspectionId, reservation.id)
    if (completeResult.error && !reason) {
      setStepError(completeResult.error)
      return
    }

    const result = await completeRentalAction(reservation.id, vehicleOutcome, reason)
    if (result.error) {
      if (canOverride && !showOverride) {
        setShowOverride(true)
        setStepError(result.error)
        return
      }
      setStepError(result.error)
      return
    }

    router.push(`/reservations/${reservation.id}`)
  }

  function next() {
    setStepError(null)
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  function back() {
    setStepError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  const requirementItems: RequirementItem[] = [
    {
      label: "Inspection completed",
      done: Boolean(odometerKm && fuelLevel && cleanliness && overallCondition),
    },
    { label: "Balance settled", done: payment.remainingMad <= 0 },
    {
      label: "Deposit resolved",
      done:
        (deposit?.collectedMad ?? 0) === 0 ||
        (deposit?.returnedMad ?? 0) + (deposit?.retainedMad ?? 0) >= (deposit?.collectedMad ?? 0),
    },
  ]

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div aria-live="polite" className="sr-only">
        {STEPS[step].label} — step {step + 1} of {STEPS.length}
      </div>
      <WizardProgress steps={STEPS} currentStep={step} />
      <RequirementsSummary items={requirementItems} />

      <div ref={stepContainerRef} className="flex flex-col gap-6">
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Return details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Planned return</span>
                <span className="text-sm font-medium text-foreground">{formatDate(reservation.endDate)}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Actual return</span>
                <span className={isLate ? "text-sm font-medium text-red-600 dark:text-red-400" : "text-sm font-medium text-foreground"}>
                  {isLate ? "Late" : "On time"} — now
                </span>
              </div>
            </div>
            {isLate && (
              <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="size-4 shrink-0" />
                This return is later than the planned date. Consider recording a late-return charge in the next
                steps.
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="returnNotes">Notes</Label>
              <textarea
                id="returnNotes"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                rows={3}
                className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                placeholder="Keys returned, anything the customer mentioned…"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Vehicle condition</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="odometer">Odometer (km)</Label>
                <Input id="odometer" type="number" value={odometerKm} onChange={(e) => setOdometerKm(e.target.value)} required />
                {pickup?.odometerKm != null && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Gauge className="size-3.5" />
                    {pickup.odometerKm.toLocaleString()} km at pickup
                    {distanceDrivenKm != null && distanceDrivenKm >= 0 ? ` · ${distanceDrivenKm.toLocaleString()} km driven` : ""}
                  </p>
                )}
                {odometerBelowPickup && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="size-3.5" />
                    Can&apos;t be lower than the pickup reading ({pickup?.odometerKm?.toLocaleString()} km).
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Fuel level</Label>
                <SegmentedSelector options={FUEL_OPTIONS} value={fuelLevel} onChange={setFuelLevel} />
                {pickup?.fuelLevel && <p className="text-xs text-muted-foreground">At pickup: {pickup.fuelLevel.replace("_", " ")}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Cleanliness</Label>
                <SegmentedSelector options={CLEANLINESS_OPTIONS} value={cleanliness} onChange={setCleanliness} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Overall condition</Label>
                <SegmentedSelector options={CONDITION_OPTIONS} value={overallCondition} onChange={setOverallCondition} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <ChecklistSection
                template={checklistTemplate}
                responses={responses}
                onChangeResponse={(item, value) => {
                  setResponses((prev) => ({ ...prev, [item.key]: value }))
                  if (inspectionId) {
                    void saveChecklistResponse(inspectionId, item.key, item.label, item.category, value)
                  }
                }}
              />
              {pickup && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Comparing against the pickup inspection — items that changed are worth a closer look.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Photos</CardTitle>
            </CardHeader>
            <CardContent>
              {inspectionId && (
                <PhotoUploadGrid
                  slots={PHOTO_SLOTS}
                  companyId={companyId}
                  pathSegments={["media", "inspections", inspectionId]}
                  uploaded={photos}
                  onUpload={async (slotKey, file, path) => {
                    const result = await attachInspectionMedia(inspectionId, path, file.name, file.type, file.size, slotKey)
                    if (!result.error) setPhotos((prev) => [...prev, { key: slotKey }])
                    return result
                  }}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
                rows={3}
                className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Damage found at return</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                On file before this rental ({vehicleDamages.length})
              </p>
              {vehicleDamages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing on file.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {vehicleDamages.map((d) => (
                    <li key={d.id} className="py-2 text-sm text-foreground">
                      {d.vehicleArea} — {d.description}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {newDamages.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Newly recorded ({newDamages.length})
                </p>
                <ul className="flex flex-col divide-y divide-border">
                  {newDamages.map((d) => (
                    <li key={d.id} className="py-2 text-sm text-foreground">
                      {d.vehicleArea} — {d.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {showDamageForm ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">
                <Input placeholder="Area (e.g. rear bumper)" value={damageArea} onChange={(e) => setDamageArea(e.target.value)} />
                <Input placeholder="Description" value={damageDescription} onChange={(e) => setDamageDescription(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowDamageForm(false)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={() => startTransition(submitDamage)} disabled={isPending}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setShowDamageForm(true)}>
                <Plus />
                Record new damage
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Additional charges</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current balance</span>
                <span className="font-medium text-foreground">{formatMad(payment.remainingMad)} remaining</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <NativeSelect value={chargeType} onChange={(e) => setChargeType(e.target.value as typeof chargeType)}>
                  <option value="additional_charge">Additional charge (fuel, late, cleaning…)</option>
                  <option value="damage_charge">Damage charge</option>
                </NativeSelect>
                <NativeSelect className="w-28" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="transfer">Transfer</option>
                  <option value="other">Other</option>
                </NativeSelect>
              </div>
              <Input placeholder="Description" value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} />
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Amount (MAD)"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                />
                <Button type="button" onClick={() => startTransition(submitCharge)} disabled={isPending}>
                  Add charge
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deposit resolution</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collected</span>
                <span className="font-medium text-foreground">{formatMad(deposit?.collectedMad ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Returned so far</span>
                <span className="text-foreground">{formatMad(deposit?.returnedMad ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Retained so far</span>
                <span className="text-foreground">{formatMad(deposit?.retainedMad ?? 0)}</span>
              </div>
              <Separator />
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Amount to return (MAD)"
                  value={depositReturnAmount}
                  onChange={(e) => setDepositReturnAmount(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => startTransition(submitDepositReturn)} disabled={isPending}>
                  Return
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Amount to retain (MAD)"
                  value={depositRetainAmount}
                  onChange={(e) => setDepositRetainAmount(e.target.value)}
                />
                <Input
                  placeholder="Reason"
                  value={depositRetainReason}
                  onChange={(e) => setDepositRetainReason(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => startTransition(submitDepositRetain)} disabled={isPending}>
                  Retain
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Complete rental</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryRow label="Distance driven" value={distanceDrivenKm != null ? `${distanceDrivenKm.toLocaleString()} km` : "—"} />
              <SummaryRow
                label="Fuel"
                value={
                  pickup?.fuelLevel && fuelLevel
                    ? `${pickup.fuelLevel.replace("_", " ")} → ${fuelLevel.replace("_", " ")}`
                    : (fuelLevel?.replace("_", " ") ?? "Not set")
                }
              />
              <SummaryRow label="Checklist issues" value={checklistIssues > 0 ? `${checklistIssues} flagged` : "None"} />
              <SummaryRow label="New damage" value={newDamages.length > 0 ? `${newDamages.length} recorded` : "None"} />
              <SummaryRow label="Balance" value={`${formatMad(payment.remainingMad)} remaining`} />
              <SummaryRow label="Deposit returned" value={formatMad(deposit?.returnedMad ?? 0)} />
              <SummaryRow label="Deposit retained" value={formatMad(deposit?.retainedMad ?? 0)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Vehicle outcome</Label>
              <SegmentedSelector options={OUTCOME_OPTIONS} value={vehicleOutcome} onChange={setVehicleOutcome} />
              <p className="text-xs text-muted-foreground">
                A vehicle with new damage should usually go to maintenance, not straight back to available.
              </p>
            </div>

            {payment.remainingMad > 0 && (
              <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="size-4 shrink-0" />
                {formatMad(payment.remainingMad)} still due.
              </div>
            )}

            {showOverride && (
              <div className="flex flex-col gap-2 rounded-2xl border border-amber-300 p-3 dark:border-amber-500/40">
                <p className="text-sm font-medium text-foreground">Override reason required</p>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={2}
                  className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  placeholder="Why are you completing without a completed return inspection or full payment?"
                />
              </div>
            )}

            {stepError && (
              <p className="text-sm text-destructive" role="alert">
                {stepError}
              </p>
            )}

            <Button
              type="button"
              size="lg"
              disabled={isPending}
              onClick={() => startTransition(() => complete(showOverride ? overrideReason : undefined))}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Complete rental
            </Button>
          </CardContent>
        </Card>
      )}

      {stepError && step !== 4 && (
        <p className="text-sm text-destructive" role="alert">
          {stepError}
        </p>
      )}
      </div>

      <WizardFooter
        onBack={back}
        backDisabled={step === 0}
        hideContinue={step === 4}
        onContinue={step === 1 ? () => startTransition(saveInspectionStep) : next}
        continuePending={step === 1 && isPending}
        continueDisabled={step === 1 && (isPending || odometerBelowPickup)}
      />
    </div>
  )
}

export { ReturnWizard }
