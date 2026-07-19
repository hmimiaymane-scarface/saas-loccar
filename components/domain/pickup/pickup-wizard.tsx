"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Phone,
  AlertTriangle,
  CheckCircle2,
  Plus,
} from "lucide-react"

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
import { formatMad, formatDate } from "@/lib/format"
import {
  startInspection,
  saveInspectionFields,
  saveChecklistResponse,
  attachInspectionMedia,
  completeInspectionAction,
} from "@/app/(dashboard)/inspections/actions"
import { activateRentalAction } from "@/app/(dashboard)/reservations/actions"
import { collectDeposit, recordPayment } from "@/app/(dashboard)/payments/actions"
import { createDamage } from "@/app/(dashboard)/damages/actions"
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
import { DocumentUploadRow, type DocumentSlotDef } from "@/components/domain/documents/document-upload-row"

const STEPS = [
  { label: "Customer" },
  { label: "Documents" },
  { label: "Payment" },
  { label: "Inspection" },
  { label: "Review" },
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

const DOCUMENT_SLOTS: DocumentSlotDef[] = [
  { category: "rental_contract", label: "Rental contract" },
  { category: "identity_document", label: "Identity document" },
  { category: "driving_licence", label: "Driving licence" },
]

const PHOTO_SLOTS = [
  { key: "front", label: "Front" },
  { key: "rear", label: "Rear" },
  { key: "driver_side", label: "Driver side" },
  { key: "passenger_side", label: "Passenger side" },
  { key: "interior", label: "Interior" },
  { key: "dashboard_odometer", label: "Odometer" },
  { key: "fuel_gauge", label: "Fuel gauge" },
]

interface PickupWizardProps {
  reservation: ReservationDetail
  companyId: string
  checklistTemplate: ChecklistTemplateItem[]
  vehicleDamages: Damage[]
  canOverride: boolean
}

function PickupWizard({ reservation, companyId, checklistTemplate, vehicleDamages, canOverride }: PickupWizardProps) {
  const router = useRouter()
  // Resume at the first incomplete step after a refresh — computed once
  // from what was already saved server-side, never re-evaluated as the
  // user navigates manually within this session.
  const [step, setStep] = useState(() =>
    resolveInitialStep([
      Boolean(reservation.vehicle),
      DOCUMENT_SLOTS.every((slot) => reservation.documents.some((d) => d.category === slot.category)),
      reservation.payment.remainingMad <= 0,
      Boolean(
        reservation.pickupInspection?.odometerKm != null &&
          reservation.pickupInspection?.fuelLevel &&
          reservation.pickupInspection?.cleanliness &&
          reservation.pickupInspection?.overallCondition
      ),
      false,
    ])
  )
  const stepContainerRef = useStepFocus<HTMLDivElement>(step)
  const [isPending, startTransition] = useTransition()
  const [stepError, setStepError] = useState<string | null>(null)

  // Inspection ------------------------------------------------------------
  const [inspectionId, setInspectionId] = useState<string | null>(reservation.pickupInspection?.id ?? null)
  const [odometerKm, setOdometerKm] = useState<string>(
    reservation.pickupInspection?.odometerKm != null ? String(reservation.pickupInspection.odometerKm) : ""
  )
  const [fuelLevel, setFuelLevel] = useState<FuelLevel | null>(reservation.pickupInspection?.fuelLevel ?? null)
  const [cleanliness, setCleanliness] = useState<Cleanliness | null>(reservation.pickupInspection?.cleanliness ?? null)
  const [overallCondition, setOverallCondition] = useState<OverallCondition | null>(
    reservation.pickupInspection?.overallCondition ?? null
  )
  const [inspectionNotes, setInspectionNotes] = useState(reservation.pickupInspection?.notes ?? "")
  const [responses, setResponses] = useState<Record<string, ChecklistResponseValue>>(() => {
    const initial: Record<string, ChecklistResponseValue> = {}
    for (const r of reservation.pickupInspection?.checklist ?? []) initial[r.itemKey] = r.response
    return initial
  })
  const [photos, setPhotos] = useState<UploadedPhoto[]>(
    (reservation.pickupInspection?.media ?? []).map((m) => ({ key: m.caption ?? m.id }))
  )

  // Ensure a draft inspection exists as soon as the employee reaches this flow.
  useEffect(() => {
    if (inspectionId) return
    startTransition(async () => {
      const result = await startInspection(reservation.id, "pickup")
      if (result.inspectionId) setInspectionId(result.inspectionId)
      else if (result.error) setStepError(result.error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Documents ---------------------------------------------------------------
  const [documents, setDocuments] = useState(reservation.documents)

  // Payment / deposit --------------------------------------------------------
  const [payment, setPayment] = useState(reservation.payment)
  const [deposit, setDeposit] = useState(reservation.deposit)
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [depositAmount, setDepositAmount] = useState("")

  async function submitPayment() {
    const amount = Number(paymentAmount)
    if (!amount || amount <= 0) {
      setStepError("Enter a payment amount.")
      return
    }
    setStepError(null)
    const formData = new FormData()
    formData.set("customerId", reservation.customer.id)
    formData.set("reservationId", reservation.id)
    formData.set("transactionType", "rental_payment")
    formData.set("amount", String(amount))
    formData.set("method", paymentMethod)
    const result = await recordPayment({}, formData)
    if (result.error) {
      setStepError(result.error)
      return
    }
    setPayment((p) => ({
      ...p,
      amountPaidMad: p.amountPaidMad + amount,
      remainingMad: Math.max(0, p.remainingMad - amount),
      status: p.remainingMad - amount <= 0 ? "paid" : "partial",
    }))
    setPaymentAmount("")
  }

  async function submitDeposit() {
    const amount = Number(depositAmount)
    if (!amount || amount <= 0) {
      setStepError("Enter a deposit amount.")
      return
    }
    setStepError(null)
    const result = await collectDeposit(reservation.id, amount, paymentMethod)
    if (result.error) {
      setStepError(result.error)
      return
    }
    setDeposit((d) => ({
      id: d?.id ?? "",
      reservationId: reservation.id,
      status: "collected",
      expectedMad: d?.expectedMad ?? amount,
      collectedMad: (d?.collectedMad ?? 0) + amount,
      returnedMad: d?.returnedMad ?? 0,
      retainedMad: d?.retainedMad ?? 0,
      method: paymentMethod,
      collectedAt: new Date().toISOString(),
      returnedAt: d?.returnedAt ?? null,
      notes: d?.notes ?? null,
    }))
    setDepositAmount("")
  }

  // Quick "new damage" from the inspection step -------------------------------
  const [showDamageForm, setShowDamageForm] = useState(false)
  const [damageArea, setDamageArea] = useState("")
  const [damageDescription, setDamageDescription] = useState("")
  const [localDamages, setLocalDamages] = useState(vehicleDamages)

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
    formData.set("preExisting", "true")
    const result = await createDamage({}, formData)
    if (result.error) {
      setStepError(result.error)
      return
    }
    setLocalDamages((prev) => [
      {
        id: result.damageId!,
        vehicleId: reservation.vehicle?.id ?? "",
        vehicleLabel: reservation.vehicle ? `${reservation.vehicle.make} ${reservation.vehicle.model}` : "",
        reservationId: reservation.id,
        reservationReference: reservation.reference,
        discoveredInInspectionId: inspectionId,
        status: "existing",
        category: "bodywork",
        vehicleArea: damageArea,
        severity: "minor",
        description: damageDescription,
        preExisting: true,
        estimatedCostMad: null,
        actualCostMad: null,
        createdByName: null,
        createdAt: new Date().toISOString(),
        media: [],
      },
      ...prev,
    ])
    setDamageArea("")
    setDamageDescription("")
    setShowDamageForm(false)
  }

  // Review / activation --------------------------------------------------------
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
      notes: inspectionNotes || undefined,
    })
    if (result.error) {
      setStepError(result.error)
      return
    }
    setStep(4)
  }

  async function activate(reason?: string) {
    if (!inspectionId) return
    setStepError(null)

    const completeResult = await completeInspectionAction(inspectionId, reservation.id)
    if (completeResult.error && !reason) {
      // Missing fields — send them back rather than offering an override
      // for something that isn't a policy exception.
      setStepError(completeResult.error)
      return
    }

    const activateResult = await activateRentalAction(reservation.id, reason)
    if (activateResult.error) {
      if (canOverride && !showOverride) {
        setShowOverride(true)
        setStepError(activateResult.error)
        return
      }
      setStepError(activateResult.error)
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
    { label: "Vehicle assigned", done: Boolean(reservation.vehicle) },
    {
      label: "Documents uploaded",
      done: DOCUMENT_SLOTS.every((slot) => documents.some((d) => d.category === slot.category)),
    },
    { label: "Balance settled", done: payment.remainingMad <= 0 },
    {
      label: "Inspection completed",
      done: Boolean(odometerKm && fuelLevel && cleanliness && overallCondition),
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
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <p className="text-base font-medium text-foreground">{reservation.customer.fullName}</p>
                <p className="text-sm text-muted-foreground">{reservation.customer.phone}</p>
              </div>
              <Button variant="outline" size="icon" asChild>
                <a href={`tel:${reservation.customer.phone}`} aria-label="Call customer">
                  <Phone className="size-4" />
                </a>
              </Button>
            </div>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Vehicle</span>
                <span className="text-sm font-medium text-foreground">
                  {reservation.vehicle ? `${reservation.vehicle.make} ${reservation.vehicle.model} · ${reservation.vehicle.plate}` : "Unassigned"}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Rental period</span>
                <span className="text-sm font-medium text-foreground">
                  {formatDate(reservation.startDate)} – {formatDate(reservation.endDate)}
                </span>
              </div>
            </div>
            {!reservation.vehicle && (
              <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="size-4 shrink-0" />
                Assign a vehicle to this reservation before continuing.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {DOCUMENT_SLOTS.map((slot) => (
              <DocumentUploadRow
                key={slot.category}
                slot={slot}
                companyId={companyId}
                reservationId={reservation.id}
                existing={documents.find((d) => d.category === slot.category)}
                onUploaded={(doc) => setDocuments((prev) => [doc, ...prev.filter((d) => d.category !== slot.category)])}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Rental balance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium text-foreground">{formatMad(payment.totalDueMad)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-foreground">{formatMad(payment.amountPaidMad)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Remaining</span>
                <span className="text-foreground">{formatMad(payment.remainingMad)}</span>
              </div>
              <Separator className="my-2" />
              <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="paymentAmount">Record a payment (MAD)</Label>
                  <Input
                    id="paymentAmount"
                    type="number"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                </div>
                <NativeSelect
                  className="w-28"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="transfer">Transfer</option>
                  <option value="other">Other</option>
                </NativeSelect>
                <Button type="button" onClick={() => startTransition(submitPayment)} disabled={isPending}>
                  Record
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deposit</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected</span>
                <span className="text-foreground">{formatMad(deposit?.expectedMad ?? 0)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Collected</span>
                <span className="text-foreground">{formatMad(deposit?.collectedMad ?? 0)}</span>
              </div>
              <Separator className="my-2" />
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="depositAmount">Collect deposit (MAD)</Label>
                  <Input
                    id="depositAmount"
                    type="number"
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                </div>
                <Button type="button" onClick={() => startTransition(submitDeposit)} disabled={isPending}>
                  Collect
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Vehicle condition</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="odometer">Odometer (km)</Label>
                <Input
                  id="odometer"
                  type="number"
                  value={odometerKm}
                  onChange={(e) => setOdometerKm(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Fuel level</Label>
                <SegmentedSelector options={FUEL_OPTIONS} value={fuelLevel} onChange={setFuelLevel} />
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
              <CardTitle>Existing damage</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {localDamages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No damage on file for this vehicle.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {localDamages.map((d) => (
                    <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-foreground">{d.vehicleArea}</span>
                      <span className="text-xs text-muted-foreground">{d.description}</span>
                    </li>
                  ))}
                </ul>
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
                  Note existing damage
                </Button>
              )}
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
                placeholder="Anything worth noting about this pickup…"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Review &amp; activate</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryRow label="Customer" value={reservation.customer.fullName} />
              <SummaryRow
                label="Vehicle"
                value={reservation.vehicle ? `${reservation.vehicle.make} ${reservation.vehicle.model}` : "Unassigned"}
              />
              <SummaryRow label="Documents" value={`${documents.length} uploaded`} />
              <SummaryRow label="Payment" value={`${formatMad(payment.amountPaidMad)} of ${formatMad(payment.totalDueMad)}`} />
              <SummaryRow label="Deposit" value={formatMad(deposit?.collectedMad ?? 0)} />
              <SummaryRow label="Odometer" value={odometerKm ? `${odometerKm} km` : "Not set"} />
              <SummaryRow label="Fuel" value={fuelLevel ?? "Not set"} />
              <SummaryRow
                label="Checklist issues"
                value={checklistIssues > 0 ? `${checklistIssues} flagged` : "None"}
              />
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
                  placeholder="Why are you activating without a completed pickup inspection or full payment?"
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
              onClick={() => startTransition(() => activate(showOverride ? overrideReason : undefined))}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Activate rental
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              The vehicle will be marked rented and the reservation becomes active.
            </p>
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
        onContinue={step < 3 ? next : () => startTransition(saveInspectionStep)}
        continueLabel={step === 3 ? "Continue to review" : "Continue"}
        continuePending={step === 3 && isPending}
        continueDisabled={step === 3 && isPending}
      />
    </div>
  )
}

export { PickupWizard }
