"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
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
import { missingRequiredPhotoSlots, pickupCompletenessItems, isPickupInspectionComplete } from "@/lib/inspections/rules"
import { PHOTO_SLOTS } from "@/lib/inspections/photo-slots"
import { buildInlineNudges } from "@/lib/mobile/inline-nudges"
import { useStepFocus } from "@/hooks/use-step-focus"
import { useOfflineQueue } from "@/hooks/use-offline-queue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { WizardProgress } from "@/components/domain/wizard-progress"
import { OfflineStatusBanner } from "@/components/domain/offline-status-banner"
import { InlineNudgeList } from "@/components/domain/mobile/inline-nudge-list"
import { WizardFooter } from "@/components/domain/wizard-footer"
import { MoneySummaryCard } from "@/components/domain/money-summary-card"
import { SummaryRow } from "@/components/domain/summary-row"
import { RequirementsSummary } from "@/components/domain/requirements-summary"
import { SegmentedSelector } from "@/components/domain/inspections/segmented-selector"
import { ChecklistSection } from "@/components/domain/inspections/checklist-section"
import { PhotoUploadGrid, type UploadedPhoto } from "@/components/domain/photo-upload-grid"
import { AdditionalPhotos } from "@/components/domain/inspections/additional-photos"
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
        reservation.pickupInspection?.cleanliness &&
          reservation.pickupInspection?.overallCondition &&
          isPickupInspectionComplete({
            odometerKm: reservation.pickupInspection?.odometerKm ?? null,
            fuelLevel: reservation.pickupInspection?.fuelLevel ?? null,
            capturedPhotoSlotKeys: (reservation.pickupInspection?.media ?? []).map((m) => m.caption ?? ""),
            existingDamageReviewed: reservation.pickupInspection?.existingDamageReviewed ?? false,
          })
      ),
      false,
    ])
  )
  const stepContainerRef = useStepFocus<HTMLDivElement>(step)
  const [isPending, startTransition] = useTransition()
  const [stepError, setStepError] = useState<string | null>(null)

  // Offline queue (roadmap phase 16 requirement 6) — inspection field
  // saves, photo capture, and document scanning are queueable with the
  // network fully disabled; a mutation's id is tracked in
  // queuedMutationIds so the final completion step can list them as
  // dependsOn, keeping sync order correct (photos/documents before the
  // inspection is marked complete). Deliberately NOT extended to
  // activateRentalAction below — that's a reservation-status/payment
  // transition, a heavier action this checkpoint keeps online-only; see
  // docs/mobile.md for the full boundary.
  const { isOnline, enqueue, pendingCount, needsReviewCount } = useOfflineQueue(companyId)
  const queuedMutationIds = useRef<string[]>([])

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
  // Phase 25 — completing a pickup inspection can't skip actually looking
  // at the vehicle's existing damage with the customer; see
  // complete_inspection() in 20260808090000_pickup_existing_damage_review.sql.
  const [existingDamageReviewed, setExistingDamageReviewed] = useState(
    reservation.pickupInspection?.existingDamageReviewed ?? false
  )
  const [responses, setResponses] = useState<Record<string, ChecklistResponseValue>>(() => {
    const initial: Record<string, ChecklistResponseValue> = {}
    for (const r of reservation.pickupInspection?.checklist ?? []) initial[r.itemKey] = r.response
    return initial
  })
  const [photos, setPhotos] = useState<UploadedPhoto[]>(
    (reservation.pickupInspection?.media ?? []).map((m) => ({ key: m.caption ?? m.id }))
  )
  // Phase 25 — optional, never-gated photos beyond the required angles.
  const [additionalPhotoCount, setAdditionalPhotoCount] = useState(
    (reservation.pickupInspection?.media ?? []).filter((m) => m.caption === "additional").length
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

  // Phase 24 — "extras" reuses the existing additional_charge
  // transaction type (already real, already supported by the general
  // Payments module) rather than inventing an invoice/line-item
  // concept. One combined action — the customer decided to add
  // something and paid for it right now — adds to both the running
  // Extras total and Paid now in the same instant.
  const [extrasMad, setExtrasMad] = useState(0)
  const [showExtraForm, setShowExtraForm] = useState(false)
  const [extraLabel, setExtraLabel] = useState("")
  const [extraAmount, setExtraAmount] = useState("")

  async function submitExtra() {
    const amount = Number(extraAmount)
    if (!amount || amount <= 0) {
      setStepError("Enter an extra charge amount.")
      return
    }
    if (!extraLabel.trim()) {
      setStepError("Describe the extra charge.")
      return
    }
    setStepError(null)
    const formData = new FormData()
    formData.set("customerId", reservation.customer.id)
    formData.set("reservationId", reservation.id)
    formData.set("transactionType", "additional_charge")
    formData.set("amount", String(amount))
    formData.set("method", paymentMethod)
    formData.set("notes", extraLabel.trim())
    const result = await recordPayment({}, formData)
    if (result.error) {
      setStepError(result.error)
      return
    }
    setExtrasMad((e) => e + amount)
    setPayment((p) => ({
      ...p,
      amountPaidMad: p.amountPaidMad + amount,
    }))
    setExtraLabel("")
    setExtraAmount("")
    setShowExtraForm(false)
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
        source: "manual",
        aiConfidence: null,
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
    const fields = {
      odometerKm: odometerKm ? Number(odometerKm) : undefined,
      fuelLevel: fuelLevel ?? undefined,
      cleanliness: cleanliness ?? undefined,
      overallCondition: overallCondition ?? undefined,
      notes: inspectionNotes || undefined,
      existingDamageReviewed,
    }

    async function queueFields() {
      const mutationId = await enqueue("saveInspectionFields", { inspectionId, fields })
      queuedMutationIds.current.push(mutationId)
      setStep(4)
    }

    if (!isOnline) {
      await queueFields()
      return
    }

    let result: { error?: string }
    try {
      result = await saveInspectionFields(inspectionId, fields)
    } catch {
      // navigator.onLine said we were online but the request itself
      // failed mid-flight — same queue path the offline branch already
      // uses, rather than losing the entered fields silently.
      await queueFields()
      return
    }
    if (result.error) {
      setStepError(result.error)
      return
    }
    setStep(4)
  }

  async function activate(reason?: string) {
    if (!inspectionId) return
    setStepError(null)

    // Bible Chapter 4 §16 — a specific "you forgot the rear photo"
    // message, not a generic failure, and checked before the RPC call
    // (which enforces the same rule server-side, see
    // 20260802090000_inspection_photo_completeness.sql) so this doesn't
    // cost a round trip for the common case of a genuinely missing photo.
    const missingSlots = missingRequiredPhotoSlots(photos.map((p) => p.key))
    if (missingSlots.length > 0 && !reason) {
      const labels = missingSlots.map((key) => PHOTO_SLOTS.find((s) => s.key === key)?.label ?? key)
      setStepError(`Missing required photos: ${labels.join(", ")}.`)
      return
    }

    // Same "specific message before the RPC" treatment as the photo
    // check above — see complete_inspection()'s pickup-only check in
    // 20260808090000_pickup_existing_damage_review.sql.
    if (!existingDamageReviewed && !reason) {
      setStepError("Confirm you've reviewed the vehicle's existing damage before activating.")
      return
    }

    async function queueCompletion() {
      const mutationId = await enqueue(
        "completeInspection",
        { inspectionId, reservationId: reservation.id },
        { dependsOn: [...queuedMutationIds.current] }
      )
      queuedMutationIds.current.push(mutationId)
      setStepError(
        "You're offline — the inspection is saved on this device and will finish completing once you're back online. Activating the rental needs a connection."
      )
    }

    if (!isOnline) {
      await queueCompletion()
      return
    }

    let completeResult: { error?: string }
    try {
      completeResult = await completeInspectionAction(inspectionId, reservation.id)
    } catch {
      // Same "looked online, request failed" case as saveInspectionStep
      // — queue it instead of silently losing a completed inspection.
      await queueCompletion()
      return
    }
    if (completeResult.error && !reason) {
      // Missing fields — send them back rather than offering an override
      // for something that isn't a policy exception.
      setStepError(completeResult.error)
      return
    }

    let activateResult: { error?: string }
    try {
      activateResult = await activateRentalAction(reservation.id, reason)
    } catch {
      // activateRentalAction has no offline-queue mutation type — out
      // of phase 16's field-capture scope (vehicle/rental status, not
      // inspection data). The inspection above is already safely
      // completed server-side; surface a clear retryable error instead
      // of an unhandled rejection.
      setStepError("The inspection completed, but activating the rental failed — check your connection and try again.")
      return
    }
    if (activateResult.error) {
      if (canOverride && !showOverride) {
        setShowOverride(true)
        setStepError(activateResult.error)
        return
      }
      setStepError(activateResult.error)
      return
    }

    router.push(`/reservations/${reservation.id}?justActivated=1`)
  }

  function next() {
    setStepError(null)
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  function back() {
    setStepError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  // Phase 25 — the single definition of "is the inspection actually done"
  // (odometer, fuel, every required photo, existing-damage review — the
  // same checks complete_inspection() enforces), shared by the step-3
  // completeness banner below and this wizard-level strip so the two can
  // never silently disagree about what "done" means.
  const pickupProgress = useMemo(
    () => ({
      odometerKm: odometerKm ? Number(odometerKm) : null,
      fuelLevel,
      capturedPhotoSlotKeys: photos.map((p) => p.key),
      existingDamageReviewed,
    }),
    [odometerKm, fuelLevel, photos, existingDamageReviewed]
  )
  const inspectionCompletenessItems = useMemo(() => pickupCompletenessItems(pickupProgress), [pickupProgress])

  const requirementItems: RequirementItem[] = [
    { label: "Vehicle assigned", done: Boolean(reservation.vehicle) },
    {
      label: "Documents uploaded",
      done: DOCUMENT_SLOTS.every((slot) => documents.some((d) => d.category === slot.category)),
    },
    { label: "Balance settled", done: payment.remainingMad <= 0 },
    {
      label: "Inspection completed",
      done: isPickupInspectionComplete(pickupProgress) && Boolean(cleanliness && overallCondition),
    },
  ]

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div aria-live="polite" className="sr-only">
        {STEPS[step].label} — step {step + 1} of {STEPS.length}
      </div>
      <WizardProgress steps={STEPS} currentStep={step} />
      <OfflineStatusBanner isOnline={isOnline} pendingCount={pendingCount} needsReviewCount={needsReviewCount} />
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
                onQueueOffline={async (file) => {
                  const mutationId = await enqueue(
                    "createDocumentRecord",
                    {
                      category: slot.category,
                      originalFilename: file.name,
                      mimeType: file.type,
                      fileSizeBytes: file.size,
                      reservationId: reservation.id,
                    },
                    { file: { blob: file, fileName: file.name, mimeType: file.type } }
                  )
                  queuedMutationIds.current.push(mutationId)
                  return { mutationId }
                }}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <MoneySummaryCard
            rentalPriceMad={payment.totalDueMad}
            extrasMad={extrasMad}
            totalMad={payment.totalDueMad + extrasMad}
            paidMad={payment.amountPaidMad}
            remainingMad={payment.remainingMad}
            depositCollectedMad={deposit?.collectedMad ?? 0}
            depositExpectedMad={deposit?.expectedMad}
          />

          <Card>
            <CardHeader>
              <CardTitle>Record a payment</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="paymentAmount">Amount (MAD)</Label>
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

              <Separator />

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

              <Separator />

              {showExtraForm ? (
                <div className="flex flex-col gap-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="extraLabel">What&apos;s the extra for?</Label>
                      <Input id="extraLabel" placeholder="e.g. Child seat" value={extraLabel} onChange={(e) => setExtraLabel(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="extraAmount">Amount (MAD)</Label>
                      <Input id="extraAmount" type="number" step="0.01" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowExtraForm(false)}>
                      Cancel
                    </Button>
                    <Button type="button" size="sm" onClick={() => startTransition(submitExtra)} disabled={isPending}>
                      Add & mark paid
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setShowExtraForm(true)}>
                  + Add extra charge
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <RequirementsSummary items={inspectionCompletenessItems} />

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
              <Separator />
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={existingDamageReviewed}
                  onChange={(e) => setExistingDamageReviewed(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-border"
                />
                I&apos;ve reviewed the vehicle for existing damage with the customer.
              </label>
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
                    try {
                      const result = await attachInspectionMedia(inspectionId, path, file.name, file.type, file.size, slotKey)
                      if (!result.error) setPhotos((prev) => [...prev, { key: slotKey }])
                      return result
                    } catch {
                      // The photo already uploaded to Storage successfully
                      // (PhotoUploadGrid only calls onUpload after that) —
                      // only this metadata call failed mid-flight. Queue
                      // recording it against the already-uploaded path
                      // instead of losing the metadata or re-uploading.
                      const mutationId = await enqueue("attachInspectionMedia", {
                        inspectionId,
                        caption: slotKey,
                        storagePath: path,
                        fileName: file.name,
                        mimeType: file.type,
                        fileSizeBytes: file.size,
                      })
                      queuedMutationIds.current.push(mutationId)
                      setPhotos((prev) => [...prev, { key: slotKey }])
                      return {}
                    }
                  }}
                  onQueueOffline={async (slotKey, file) => {
                    const mutationId = await enqueue(
                      "attachInspectionMedia",
                      { inspectionId, caption: slotKey },
                      { file: { blob: file, fileName: file.name, mimeType: file.type } }
                    )
                    queuedMutationIds.current.push(mutationId)
                    setPhotos((prev) => [...prev, { key: slotKey }])
                    return {}
                  }}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Additional photos</CardTitle>
            </CardHeader>
            <CardContent>
              {inspectionId && (
                <AdditionalPhotos
                  companyId={companyId}
                  pathSegments={["media", "inspections", inspectionId]}
                  count={additionalPhotoCount}
                  onUpload={async (file, path) => {
                    try {
                      const result = await attachInspectionMedia(inspectionId, path, file.name, file.type, file.size, "additional")
                      if (!result.error) setAdditionalPhotoCount((n) => n + 1)
                      return result
                    } catch {
                      const mutationId = await enqueue("attachInspectionMedia", {
                        inspectionId,
                        caption: "additional",
                        storagePath: path,
                        fileName: file.name,
                        mimeType: file.type,
                        fileSizeBytes: file.size,
                      })
                      queuedMutationIds.current.push(mutationId)
                      setAdditionalPhotoCount((n) => n + 1)
                      return {}
                    }
                  }}
                  onQueueOffline={async (file) => {
                    const mutationId = await enqueue(
                      "attachInspectionMedia",
                      { inspectionId, caption: "additional" },
                      { file: { blob: file, fileName: file.name, mimeType: file.type } }
                    )
                    queuedMutationIds.current.push(mutationId)
                    setAdditionalPhotoCount((n) => n + 1)
                    return {}
                  }}
                />
              )}
            </CardContent>
          </Card>

          <InlineNudgeList nudges={buildInlineNudges({ capturedPhotoSlots: photos.map((p) => p.key), vehicleDamageCount: localDamages.length })} />

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
                rows={3}
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
                <Textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={2}
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
