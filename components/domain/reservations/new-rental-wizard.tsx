"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search, UserRound, AlertTriangle, CheckCircle2, PenLine, ZoomIn } from "lucide-react"

import type {
  Branch,
  ChecklistResponseValue,
  ChecklistTemplateItem,
  Cleanliness,
  Customer,
  FuelLevel,
  OverallCondition,
  PaymentMethod,
  VehicleCategory,
} from "@/types/rental"
import type { AssignableEmployee } from "@/components/domain/reservations/reservation-form"
import type { ExtractedFields } from "@/lib/document-extraction"
import { confidenceTier } from "@/lib/tone"
import type { DuplicateMatch } from "@/lib/customer-matching"
import type { ReturningCustomerReadiness } from "@/lib/customer-readiness"
import { fetchCustomers, checkCustomerByPhone, createReservationInWizard, activateRentalAction } from "@/app/(dashboard)/reservations/actions"
import { createCustomer } from "@/app/(dashboard)/customers/actions"
import { createDocumentRecord } from "@/app/(dashboard)/documents/actions"
import { recordPayment, collectDeposit } from "@/app/(dashboard)/payments/actions"
import { startInspection, saveInspectionFields, saveChecklistResponse, attachInspectionMedia, completeInspectionAction } from "@/app/(dashboard)/inspections/actions"
import { generateContractAction, prepareContractAction, sendContractForSignatureAction, addSignatureAction } from "@/app/(dashboard)/contract-templates/actions"
import { hasRequiredSignatures, type SignerType } from "@/lib/contracts/lifecycle"
import { missingRequiredPhotoSlots } from "@/lib/inspections/rules"
import { buildStoragePath } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { resolveInitialStep } from "@/lib/workflow/steps"
import { PHOTO_SLOTS } from "@/lib/inspections/photo-slots"
import { useStepFocus } from "@/hooks/use-step-focus"
import { formatMad } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { WizardProgress } from "@/components/domain/wizard-progress"
import { WizardFooter } from "@/components/domain/wizard-footer"
import { DocumentConfidenceRow } from "@/components/domain/intelligence/document-confidence-row"
import { DocumentScanCapture, type ScanCaptureResult } from "@/components/domain/customers/document-scan-capture"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ReservationForm } from "@/components/domain/reservations/reservation-form"
import { SegmentedSelector } from "@/components/domain/inspections/segmented-selector"
import { ChecklistSection } from "@/components/domain/inspections/checklist-section"
import { PhotoUploadGrid, type UploadedPhoto } from "@/components/domain/photo-upload-grid"

const STEPS = [{ label: "Customer" }, { label: "Vehicle & price" }, { label: "Payment" }, { label: "Inspection" }, { label: "Contract" }]

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

interface NewRentalWizardProps {
  companyId: string
  companyTimezone: string
  branches: Branch[]
  checklistTemplate: ChecklistTemplateItem[]
  /** Only owner/manager may activate a rental without a completed
   * pickup inspection, with a mandatory reason — mirrors
   * `activate_rental()`'s own DB-enforced rule exactly. */
  canOverride: boolean
  assignableEmployees?: AssignableEmployee[]
  /** Roadmap phase 09's fast path — arriving here already knowing which
   * customer (e.g. from the Customer Command Center's "Start rental"),
   * so step 0 is skipped entirely instead of re-searching. */
  preselectedCustomer?: Customer
  /** Passed straight through to Step 2's embedded `ReservationForm` —
   * same `?vehicleId=`/`?rate=`/`?pickup=`/preferred-category/
   * readiness pre-fill this route already supported before this
   * phase, unchanged. */
  defaultVehicleId?: string
  defaultDailyRate?: number
  defaultPickupDate?: string
  defaultPickupLocation?: string
  defaultReturnLocation?: string
  defaultPickupHour?: number
  defaultCategory?: VehicleCategory
  returningCustomerReadiness?: ReturningCustomerReadiness
  /** Phase 20 — this customer's own most recent deposit, or a
   * company-wide fallback; pre-fills Step 2's deposit input instead of
   * leaving it empty. Still a fully editable/removable suggestion. */
  suggestedDepositMad?: number
}

function textValue(fields: ExtractedFields | null, key: string): string {
  const field = fields?.[key]
  if (!field || field.value == null) return ""
  return String(field.value)
}

/** Phase 21 — how many of `keys` extracted at critical (low)
 * confidence, behind the confidence-review summary line below. */
function countCriticalFields(fields: ExtractedFields, keys: string[]): number {
  return keys.filter((key) => confidenceTier(fields[key]?.confidence ?? 0) === "critical").length
}

/** Phase 22 — "original image remains easy to inspect": a small
 * thumbnail of the exact photo that was scanned, tap/click opens it
 * full-size in a Sheet so a low-confidence field can be checked
 * against the real document instead of trusting the OCR guess blind. */
function ScanThumbnail({ url, alt }: { url: string; alt: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Inspect ${alt}`}
        className="group relative size-12 shrink-0 overflow-hidden rounded-xl border border-border"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- object-URL preview of a locally-picked file, not a static/remote asset Next's Image component is for */}
        <img src={url} alt={alt} className="size-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
          <ZoomIn className="size-4" />
        </span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh]">
          <SheetHeader>
            <SheetTitle>{alt}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-6 pb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={alt} className="w-full rounded-2xl object-contain" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** "Understand immediately whether the photo is usable" — one
 * sentence above the confidence rows instead of making the owner scan
 * each row themselves to notice a problem. */
function ConfidenceSummary({ criticalCount, onNext }: { criticalCount: number; onNext?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        {criticalCount === 0
          ? "Looks good — nothing to review."
          : `${criticalCount} field${criticalCount === 1 ? "" : "s"} need${criticalCount === 1 ? "s" : ""} a quick check.`}
      </p>
      {criticalCount > 0 && onNext && (
        <Button type="button" variant="ghost" size="sm" onClick={onNext}>
          Next issue
        </Button>
      )}
    </div>
  )
}

/**
 * Productization wave 3 phase 18 — "the owner never needs to manually
 * navigate between modules to complete a rental." Replaces the old
 * `/reservations/new` page's single form + the separate detour to
 * `/customers/new` + the separate `/reservations/[id]/pickup` +
 * `/reservations/[id]/contract-preview` + `/contracts/[id]` pages (7
 * page loads across 3 route trees, confirmed by tracing today's actual
 * code path) with one continuous wizard on one URL. Every step below
 * reuses an already-existing, already-working piece of this app —
 * this phase is about removing navigation, not rebuilding features
 * that already work.
 *
 * Same hand-rolled wizard pattern as `CustomerOnboardingWizard`/
 * `PickupWizard` (`WizardProgress`/`WizardFooter`/`resolveInitialStep`/
 * `useStepFocus`) — this app has no generic workflow engine, just this
 * one shared shell every stepped flow reuses.
 */
function NewRentalWizard({
  companyId,
  companyTimezone,
  branches,
  checklistTemplate,
  canOverride,
  assignableEmployees = [],
  preselectedCustomer,
  defaultVehicleId,
  defaultDailyRate,
  defaultPickupDate,
  defaultPickupLocation,
  defaultReturnLocation,
  defaultPickupHour,
  defaultCategory,
  returningCustomerReadiness,
  suggestedDepositMad,
}: NewRentalWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(() => resolveInitialStep([Boolean(preselectedCustomer), false, false, false, false]))
  const stepContainerRef = useStepFocus<HTMLDivElement>(step)

  // Step 0 — Customer ----------------------------------------------------
  const [customerMode, setCustomerMode] = useState<"search" | "new">("search")
  const [newCustomerMode, setNewCustomerMode] = useState<"quick" | "scan">("quick")
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(preselectedCustomer ?? null)
  const [customerQuery, setCustomerQuery] = useState("")
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [, startCustomerSearch] = useTransition()

  const [quickName, setQuickName] = useState("")
  const [quickPhone, setQuickPhone] = useState("")
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null)
  const [, startDuplicateCheck] = useTransition()

  const [idFields, setIdFields] = useState<ExtractedFields | null>(null)
  const [idScanFile, setIdScanFile] = useState<File | null>(null)
  const [idScanNotice, setIdScanNotice] = useState<string | null>(null)
  const [idDocumentNumber, setIdDocumentNumber] = useState("")
  const [dateOfBirth, setDateOfBirth] = useState("")
  const [nationality, setNationality] = useState("")

  // Phase 22 — "original image remains easy to inspect": derived from
  // the already-captured file via useMemo (React's own "you might not
  // need an effect" guidance for state derivable during render) — a
  // plain effect below only handles revoking the URL, never setState.
  const idPreviewUrl = useMemo(() => (idScanFile ? URL.createObjectURL(idScanFile) : null), [idScanFile])
  useEffect(() => () => { if (idPreviewUrl) URL.revokeObjectURL(idPreviewUrl) }, [idPreviewUrl])

  const [licenceFields, setLicenceFields] = useState<ExtractedFields | null>(null)
  const [licenceScanFile, setLicenceScanFile] = useState<File | null>(null)
  const [licenceScanNotice, setLicenceScanNotice] = useState<string | null>(null)
  const [licenseNumber, setLicenseNumber] = useState("")
  const [licenseExpiresOn, setLicenseExpiresOn] = useState("")
  const licencePreviewUrl = useMemo(() => (licenceScanFile ? URL.createObjectURL(licenceScanFile) : null), [licenceScanFile])
  useEffect(() => () => { if (licencePreviewUrl) URL.revokeObjectURL(licencePreviewUrl) }, [licencePreviewUrl])

  // Phase 22 — "never silently overwrite corrected user data": a field
  // the user has actually typed into is protected from being clobbered
  // by a later re-scan (e.g. after "Retake"). Each row's onChange marks
  // its own key inline (rather than a shared factory function) so a
  // ref is only ever touched inside an actual event handler.
  const manuallyEditedRef = useRef<Set<string>>(new Set())

  // Phase 22 — "jump directly between uncertain fields": each block's
  // critical-tier rows are ref'd by key so "Next issue" can
  // scrollIntoView + focus the next one, cycling back to the first
  // after the last.
  const idRowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [idIssueIndex, setIdIssueIndex] = useState(0)
  const licenceRowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [licenceIssueIndex, setLicenceIssueIndex] = useState(0)

  function goToNextIssue(fields: ExtractedFields, keys: string[], rowRefs: Record<string, HTMLDivElement | null>, index: number, setIndex: (i: number) => void) {
    const criticalKeys = keys.filter((key) => confidenceTier(fields[key]?.confidence ?? 0) === "critical")
    if (criticalKeys.length === 0) return
    const nextIndex = (index + 1) % criticalKeys.length
    setIndex(nextIndex)
    const node = rowRefs[criticalKeys[nextIndex]]
    node?.scrollIntoView({ behavior: "smooth", block: "center" })
    node?.querySelector("input")?.focus()
  }

  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateMatch[]>([])
  const [createError, setCreateError] = useState<string | null>(null)
  const [creatingCustomer, startCreatingCustomer] = useTransition()
  const [savingDocuments, setSavingDocuments] = useState(false)

  function handleCustomerQueryChange(value: string) {
    setCustomerQuery(value)
    if (!value.trim()) {
      setCustomerResults([])
      return
    }
    startCustomerSearch(async () => {
      setCustomerResults(await fetchCustomers(value))
    })
  }

  function handleQuickPhoneChange(value: string) {
    setQuickPhone(value)
    if (value.trim().length < 6) {
      setDuplicateCustomer(null)
      return
    }
    startDuplicateCheck(async () => {
      setDuplicateCustomer(await checkCustomerByPhone(value))
    })
  }

  function handleIdCaptured(file: File, result: ScanCaptureResult) {
    setIdScanFile(file)
    if (!result.ok) {
      setIdScanNotice(result.message)
      return
    }
    if (result.category !== "identity_document") {
      setIdScanNotice(`This looks like a ${result.category.replace(/_/g, " ")}, not an identity document — check the photo, or fill in the fields below by hand.`)
      return
    }
    setIdScanNotice(null)
    if (result.fields) {
      if (!quickName) setQuickName(textValue(result.fields, "fullName"))
      if (!manuallyEditedRef.current.has("idNumber")) setIdDocumentNumber(textValue(result.fields, "idNumber"))
      if (!manuallyEditedRef.current.has("birthDate")) setDateOfBirth(textValue(result.fields, "birthDate"))
      if (!manuallyEditedRef.current.has("nationality")) setNationality(textValue(result.fields, "nationality"))
      setIdFields(result.fields)
    }
  }

  function handleLicenceCaptured(file: File, result: ScanCaptureResult) {
    setLicenceScanFile(file)
    if (!result.ok) {
      setLicenceScanNotice(result.message)
      return
    }
    if (result.category !== "driving_licence") {
      setLicenceScanNotice(`This looks like a ${result.category.replace(/_/g, " ")}, not a driving licence — check the photo, or fill in the fields below by hand.`)
      return
    }
    setLicenceScanNotice(null)
    if (result.fields) {
      if (!quickName) setQuickName(textValue(result.fields, "fullName"))
      if (!manuallyEditedRef.current.has("licenceNumber")) setLicenseNumber(textValue(result.fields, "licenceNumber"))
      if (!manuallyEditedRef.current.has("expiryDate")) setLicenseExpiresOn(textValue(result.fields, "expiryDate"))
      setLicenceFields(result.fields)
    }
  }

  async function attachScannedDocuments(customerId: string, companyId: string) {
    const uploads: { file: File; category: "identity_document" | "driving_licence" }[] = []
    if (idScanFile) uploads.push({ file: idScanFile, category: "identity_document" })
    if (licenceScanFile) uploads.push({ file: licenceScanFile, category: "driving_licence" })
    if (uploads.length === 0) return

    setSavingDocuments(true)
    for (const { file, category } of uploads) {
      const path = buildStoragePath(companyId, ["customers", customerId], file.name)
      const upload = await uploadFile(path, file)
      if (upload.error) continue
      await createDocumentRecord({ category, storagePath: path, originalFilename: file.name, mimeType: file.type, fileSizeBytes: file.size, customerId })
    }
    setSavingDocuments(false)
  }

  function handleCreateCustomer(acknowledgeDuplicates: boolean) {
    setCreateError(null)
    startCreatingCustomer(async () => {
      const fd = new FormData()
      fd.set("fullName", quickName)
      fd.set("phone", quickPhone)
      if (idDocumentNumber) fd.set("idDocumentNumber", idDocumentNumber)
      if (licenseNumber) fd.set("licenseNumber", licenseNumber)
      if (licenseExpiresOn) fd.set("licenseExpiresOn", licenseExpiresOn)
      if (dateOfBirth) fd.set("dateOfBirth", dateOfBirth)
      if (nationality) fd.set("nationality", nationality)
      fd.set("acknowledgeDuplicates", acknowledgeDuplicates ? "true" : "false")

      const result = await createCustomer({}, fd)
      if (result.error) {
        setCreateError(result.error)
        return
      }
      if (result.duplicateCandidates && result.duplicateCandidates.length > 0) {
        setDuplicateCandidates(result.duplicateCandidates)
        return
      }
      if (result.customerId) {
        setDuplicateCandidates([])
        // companyId isn't known client-side here; buildStoragePath's
        // first segment is only used for the storage path prefix, and
        // createDocumentRecord itself re-derives/validates the real
        // company server-side — a placeholder segment is safe.
        await attachScannedDocuments(result.customerId, "customer-onboarding")
        setSelectedCustomer({ id: result.customerId, fullName: quickName, phone: quickPhone, licenseNumber: licenseNumber || "", licenseExpiresAt: licenseExpiresOn || "", totalBookings: 0 })
        setStep(1)
      }
    })
  }

  const customerBusy = creatingCustomer || savingDocuments

  // Phase 19 — picking an existing customer *is* the required field
  // group for this step; advance immediately instead of making the
  // user click a separate Continue after already having chosen who
  // the rental is for.
  function selectCustomerAndAdvance(customer: Customer) {
    setSelectedCustomer(customer)
    setStep(1)
  }

  // Step 1 — Vehicle & price ------------------------------------------------
  const [reservationId, setReservationId] = useState<string | null>(null)

  function handleReservationCreated(id: string, totalMad: number) {
    setReservationId(id)
    setTotalDueMad(totalMad)
    setStep(2)
  }

  // Step 2 — Payment & deposit ----------------------------------------------
  const [totalDueMad, setTotalDueMad] = useState(0)
  const [amountPaidMad, setAmountPaidMad] = useState(0)
  const [depositCollectedMad, setDepositCollectedMad] = useState(0)
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [depositAmount, setDepositAmount] = useState(suggestedDepositMad ? String(suggestedDepositMad) : "")
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentPending, startPaymentTransition] = useTransition()

  const remainingMad = Math.max(0, totalDueMad - amountPaidMad)

  function submitPayment() {
    const amount = Number(paymentAmount)
    if (!amount || amount <= 0 || !reservationId) {
      setPaymentError("Enter a payment amount.")
      return
    }
    setPaymentError(null)
    startPaymentTransition(async () => {
      const fd = new FormData()
      fd.set("reservationId", reservationId)
      if (selectedCustomer) fd.set("customerId", selectedCustomer.id)
      fd.set("transactionType", "rental_payment")
      fd.set("amount", String(amount))
      fd.set("method", paymentMethod)
      const result = await recordPayment({}, fd)
      if (result.error) {
        setPaymentError(result.error)
        return
      }
      setAmountPaidMad((p) => p + amount)
      setPaymentAmount("")
    })
  }

  function submitDeposit() {
    const amount = Number(depositAmount)
    if (!amount || amount <= 0 || !reservationId) {
      setPaymentError("Enter a deposit amount.")
      return
    }
    setPaymentError(null)
    startPaymentTransition(async () => {
      const result = await collectDeposit(reservationId, amount, paymentMethod)
      if (result.error) {
        setPaymentError(result.error)
        return
      }
      setDepositCollectedMad((d) => d + amount)
      setDepositAmount("")
    })
  }

  // Step 3 — Pickup inspection ----------------------------------------------
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [inspectionStarting, setInspectionStarting] = useState(false)
  const [odometerKm, setOdometerKm] = useState("")
  const [fuelLevel, setFuelLevel] = useState<FuelLevel | null>(null)
  const [cleanliness, setCleanliness] = useState<Cleanliness | null>(null)
  const [overallCondition, setOverallCondition] = useState<OverallCondition | null>(null)
  const [inspectionNotes, setInspectionNotes] = useState("")
  const [checklistResponses, setChecklistResponses] = useState<Record<string, ChecklistResponseValue>>({})
  const [photos, setPhotos] = useState<UploadedPhoto[]>([])
  const [inspectionError, setInspectionError] = useState<string | null>(null)
  const [inspectionPending, startInspectionTransition] = useTransition()
  const startedInspectionForReservation = useRef<string | null>(null)

  // Ensure a draft pickup inspection exists as soon as the reservation
  // itself does, once this step is actually reached — mirrors
  // PickupWizard's identical on-mount behavior.
  function ensureInspectionStarted() {
    if (!reservationId || inspectionId || inspectionStarting || startedInspectionForReservation.current === reservationId) return
    startedInspectionForReservation.current = reservationId
    setInspectionStarting(true)
    startInspectionTransition(async () => {
      const result = await startInspection(reservationId, "pickup")
      setInspectionStarting(false)
      if (result.inspectionId) setInspectionId(result.inspectionId)
      else if (result.error) setInspectionError(result.error)
    })
  }

  useEffect(() => {
    if (step === 3) ensureInspectionStarted()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the step or reservation actually changes
  }, [step, reservationId])

  function saveInspectionStep() {
    if (!inspectionId) return
    setInspectionError(null)
    startInspectionTransition(async () => {
      const result = await saveInspectionFields(inspectionId, {
        odometerKm: odometerKm ? Number(odometerKm) : undefined,
        fuelLevel: fuelLevel ?? undefined,
        cleanliness: cleanliness ?? undefined,
        overallCondition: overallCondition ?? undefined,
        notes: inspectionNotes || undefined,
      })
      if (result.error) {
        setInspectionError(result.error)
        return
      }
      setStep(4)
    })
  }

  // Step 4 — Contract & start rental -----------------------------------------
  const [contractId, setContractId] = useState<string | null>(null)
  const [signatures, setSignatures] = useState<{ signerType: SignerType; signerName: string }[]>([])
  const [contractPending, startContractTransition] = useTransition()
  const [contractError, setContractError] = useState<string | null>(null)

  const [signerType, setSignerType] = useState<SignerType>("customer")
  const [signerName, setSignerName] = useState("")
  const [signerConfirmed, setSignerConfirmed] = useState(false)

  const [showOverride, setShowOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState("")
  const [activatePending, startActivateTransition] = useTransition()
  const [activateDone, setActivateDone] = useState(false)

  const signedTypes = signatures.map((s) => s.signerType)
  const availableSignerTypes = (["customer", "employee"] as SignerType[]).filter((t) => !signedTypes.includes(t))
  const fullySigned = hasRequiredSignatures(signedTypes)

  function generateAndSendContract() {
    if (!reservationId) return
    setContractError(null)
    startContractTransition(async () => {
      const generated = await generateContractAction(reservationId)
      if (!generated.ok) {
        setContractError(generated.error)
        return
      }
      const prepared = await prepareContractAction(generated.contractId)
      if (!prepared.ok) {
        setContractError(prepared.error)
        return
      }
      const sent = await sendContractForSignatureAction(generated.contractId)
      if (!sent.ok) {
        setContractError(sent.error)
        return
      }
      setContractId(generated.contractId)
    })
  }

  function submitSignature() {
    if (!contractId || !signerName.trim() || !signerConfirmed) return
    setContractError(null)
    startContractTransition(async () => {
      const result = await addSignatureAction({ contractId, signerType, signerName: signerName.trim() })
      if (!result.ok) {
        setContractError(result.error)
        return
      }
      setSignatures((prev) => [...prev, { signerType, signerName: signerName.trim() }])
      setSignerName("")
      setSignerConfirmed(false)
    })
  }

  function startRental(reason?: string) {
    if (!inspectionId || !reservationId) return
    setContractError(null)

    const missingSlots = missingRequiredPhotoSlots(photos.map((p) => p.key))
    if (missingSlots.length > 0 && !reason) {
      const labels = missingSlots.map((key) => PHOTO_SLOTS.find((s) => s.key === key)?.label ?? key)
      setContractError(`Missing required photos: ${labels.join(", ")}.`)
      return
    }

    startActivateTransition(async () => {
      const completeResult = await completeInspectionAction(inspectionId, reservationId)
      if (completeResult.error && !reason) {
        setContractError(completeResult.error)
        return
      }

      const activateResult = await activateRentalAction(reservationId, reason)
      if (activateResult.error) {
        if (canOverride && !showOverride) {
          setShowOverride(true)
          setContractError(activateResult.error)
          return
        }
        setContractError(activateResult.error)
        return
      }

      setActivateDone(true)
    })
  }

  // The one intentional navigation in this whole flow — the natural
  // destination once the rental is actually active, not a mid-flow
  // detour the rest of this wizard was built to eliminate.
  useEffect(() => {
    if (activateDone && reservationId) router.push(`/reservations/${reservationId}`)
  }, [activateDone, reservationId, router])

  return (
    <div className="flex flex-col gap-6">
      <WizardProgress steps={STEPS} currentStep={step} />

      <div ref={stepContainerRef} className="flex flex-col gap-4">
        {step === 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Customer</CardTitle>
                <CardDescription>Find an existing customer, or add a new one without leaving this page.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex gap-2">
                  <Button type="button" variant={customerMode === "search" ? "default" : "outline"} size="sm" onClick={() => setCustomerMode("search")}>
                    Existing customer
                  </Button>
                  <Button type="button" variant={customerMode === "new" ? "default" : "outline"} size="sm" onClick={() => setCustomerMode("new")}>
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
                        <Input value={customerQuery} onChange={(e) => handleCustomerQueryChange(e.target.value)} placeholder="Search by name or phone…" className="pl-9" />
                      </div>
                      {customerResults.length > 0 && (
                        <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
                          {customerResults.map((c) => (
                            <button
                              type="button"
                              key={c.id}
                              onClick={() => selectCustomerAndAdvance(c)}
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
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-2">
                      <Button type="button" variant={newCustomerMode === "quick" ? "default" : "outline"} size="sm" onClick={() => setNewCustomerMode("quick")}>
                        Quick add
                      </Button>
                      <Button type="button" variant={newCustomerMode === "scan" ? "default" : "outline"} size="sm" onClick={() => setNewCustomerMode("scan")}>
                        Scan ID + licence
                      </Button>
                    </div>

                    {newCustomerMode === "scan" && (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                          <Label>Identity document</Label>
                          <div className="flex items-start gap-3">
                            <DocumentScanCapture label="Scan ID / passport" onCaptured={handleIdCaptured} />
                            {idPreviewUrl && <ScanThumbnail url={idPreviewUrl} alt="Scanned identity document" />}
                          </div>
                          {idScanNotice && (
                            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                              {idScanNotice}
                            </p>
                          )}
                          {idFields && (
                            <div className="flex flex-col gap-2">
                              <ConfidenceSummary
                                criticalCount={countCriticalFields(idFields, ["idNumber", "birthDate", "nationality"])}
                                onNext={() => goToNextIssue(idFields, ["idNumber", "birthDate", "nationality"], idRowRefs.current, idIssueIndex, setIdIssueIndex)}
                              />
                              <div className="flex flex-col divide-y divide-border rounded-2xl bg-muted/40 px-3">
                                <DocumentConfidenceRow ref={(el) => { idRowRefs.current.idNumber = el }} label="ID number" value={idDocumentNumber} confidence={idFields.idNumber?.confidence ?? 0} onChange={(v) => { manuallyEditedRef.current.add("idNumber"); setIdDocumentNumber(v) }} />
                                <DocumentConfidenceRow ref={(el) => { idRowRefs.current.birthDate = el }} label="Date of birth" value={dateOfBirth} confidence={idFields.birthDate?.confidence ?? 0} onChange={(v) => { manuallyEditedRef.current.add("birthDate"); setDateOfBirth(v) }} />
                                <DocumentConfidenceRow ref={(el) => { idRowRefs.current.nationality = el }} label="Nationality" value={nationality} confidence={idFields.nationality?.confidence ?? 0} onChange={(v) => { manuallyEditedRef.current.add("nationality"); setNationality(v) }} />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label>Driving licence</Label>
                          <div className="flex items-start gap-3">
                            <DocumentScanCapture label="Scan driving licence" onCaptured={handleLicenceCaptured} />
                            {licencePreviewUrl && <ScanThumbnail url={licencePreviewUrl} alt="Scanned driving licence" />}
                          </div>
                          {licenceScanNotice && (
                            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                              {licenceScanNotice}
                            </p>
                          )}
                          {licenceFields && (
                            <div className="flex flex-col gap-2">
                              <ConfidenceSummary
                                criticalCount={countCriticalFields(licenceFields, ["licenceNumber", "expiryDate"])}
                                onNext={() => goToNextIssue(licenceFields, ["licenceNumber", "expiryDate"], licenceRowRefs.current, licenceIssueIndex, setLicenceIssueIndex)}
                              />
                              <div className="flex flex-col divide-y divide-border rounded-2xl bg-muted/40 px-3">
                                <DocumentConfidenceRow ref={(el) => { licenceRowRefs.current.licenceNumber = el }} label="Licence number" value={licenseNumber} confidence={licenceFields.licenceNumber?.confidence ?? 0} onChange={(v) => { manuallyEditedRef.current.add("licenceNumber"); setLicenseNumber(v) }} />
                                <DocumentConfidenceRow ref={(el) => { licenceRowRefs.current.expiryDate = el }} label="Expires on" value={licenseExpiresOn} confidence={licenceFields.expiryDate?.confidence ?? 0} onChange={(v) => { manuallyEditedRef.current.add("expiryDate"); setLicenseExpiresOn(v) }} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="quickName">Full name</Label>
                        <Input id="quickName" value={quickName} onChange={(e) => setQuickName(e.target.value)} required />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="quickPhone">Phone</Label>
                        <Input id="quickPhone" value={quickPhone} onChange={(e) => handleQuickPhoneChange(e.target.value)} placeholder="+212 6XX-XXXXXX" required />
                      </div>
                    </div>

                    {duplicateCustomer && (
                      <div className="flex items-center justify-between rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="size-4 shrink-0" />
                          Already a customer: {duplicateCustomer.fullName}
                        </span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setCustomerMode("search"); selectCustomerAndAdvance(duplicateCustomer) }}>
                          Use them
                        </Button>
                      </div>
                    )}

                    {duplicateCandidates.length > 0 && (
                      <div className="flex flex-col gap-2.5 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="size-4 shrink-0" />
                          This might already be a customer
                        </span>
                        <ul className="flex flex-col gap-1.5">
                          {duplicateCandidates.map((candidate) => (
                            <li key={candidate.customerId} className="flex items-center justify-between gap-3">
                              <span>
                                {candidate.fullName} — {candidate.confidence}% match ({candidate.matchedFields.join(", ")})
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDuplicateCandidates([])
                                  setCustomerMode("search")
                                  selectCustomerAndAdvance({ id: candidate.customerId, fullName: candidate.fullName, phone: quickPhone, licenseNumber: "", licenseExpiresAt: "", totalBookings: 0 })
                                }}
                              >
                                Use them
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <Button type="button" variant="outline" size="sm" disabled={customerBusy} onClick={() => handleCreateCustomer(true)}>
                          {customerBusy && <Loader2 className="animate-spin" />}
                          Not a duplicate — create anyway
                        </Button>
                      </div>
                    )}

                    {createError && (
                      <p className="text-sm text-destructive" role="alert">
                        {createError}
                      </p>
                    )}

                    {duplicateCandidates.length === 0 && (
                      <div className="flex justify-end">
                        <Button type="button" disabled={customerBusy || !quickName.trim() || !quickPhone.trim()} onClick={() => handleCreateCustomer(false)}>
                          {customerBusy && <Loader2 className="animate-spin" />}
                          {savingDocuments ? "Saving documents…" : "Create customer & continue"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Phase 19 — mounted once a customer is selected and kept mounted
            (visibility toggled via CSS, not JSX) so a Step 1 -> Step 0 ->
            Step 1 round trip never discards dates/vehicle/discount the
            user already typed in. Keyed on the customer's id so picking a
            genuinely different customer still starts a fresh draft. */}
        {selectedCustomer && !reservationId && (
          <div key={selectedCustomer.id} className={step === 1 ? "flex flex-col gap-4" : "hidden"}>
            <ReservationForm
              action={createReservationInWizard}
              companyTimezone={companyTimezone}
              branches={branches}
              preselectedCustomer={selectedCustomer}
              assignableEmployees={assignableEmployees}
              defaultVehicleId={defaultVehicleId}
              defaultDailyRate={defaultDailyRate}
              defaultPickupDate={defaultPickupDate}
              defaultPickupLocation={defaultPickupLocation}
              defaultReturnLocation={defaultReturnLocation}
              defaultPickupHour={defaultPickupHour}
              defaultCategory={defaultCategory}
              returningCustomerReadiness={returningCustomerReadiness}
              onSuccess={handleReservationCreated}
            />
          </div>
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
                  <span className="font-medium text-foreground">{formatMad(totalDueMad)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="text-foreground">{formatMad(amountPaidMad)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="text-foreground">{formatMad(remainingMad)}</span>
                </div>
                <Separator className="my-2" />
                <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="paymentAmount">Record a payment (MAD)</Label>
                    <Input id="paymentAmount" type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                  </div>
                  <NativeSelect className="w-28" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="transfer">Transfer</option>
                    <option value="other">Other</option>
                  </NativeSelect>
                  <Button type="button" onClick={submitPayment} disabled={paymentPending}>
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
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Collected</span>
                  <span className="text-foreground">{formatMad(depositCollectedMad)}</span>
                </div>
                <Separator className="my-2" />
                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="depositAmount">Collect deposit (MAD)</Label>
                    <Input id="depositAmount" type="number" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                  </div>
                  <Button type="button" onClick={submitDeposit} disabled={paymentPending}>
                    Collect
                  </Button>
                </div>
              </CardContent>
            </Card>

            {paymentError && (
              <p className="text-sm text-destructive" role="alert">
                {paymentError}
              </p>
            )}

            <p className="text-xs text-muted-foreground">Payment and deposit are optional here — you can also record them later from the reservation page.</p>
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
                  <Input id="odometer" type="number" value={odometerKm} onChange={(e) => setOdometerKm(e.target.value)} required />
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
                <CardTitle>Checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <ChecklistSection
                  template={checklistTemplate}
                  responses={checklistResponses}
                  onChangeResponse={(item, value) => {
                    setChecklistResponses((prev) => ({ ...prev, [item.key]: value }))
                    if (inspectionId) void saveChecklistResponse(inspectionId, item.key, item.label, item.category, value)
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

            {inspectionError && (
              <p className="text-sm text-destructive" role="alert">
                {inspectionError}
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Contract</CardTitle>
                <CardDescription>Generate the rental agreement and collect signatures, without leaving this page.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {!contractId ? (
                  <Button type="button" onClick={generateAndSendContract} disabled={contractPending}>
                    {contractPending && <Loader2 className="animate-spin" />}
                    Generate & prepare contract
                  </Button>
                ) : (
                  <>
                    {signatures.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {signatures.map((s) => (
                          <div key={s.signerType} className="flex items-center gap-2 text-sm text-foreground">
                            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                            {s.signerType === "customer" ? "Customer" : "Employee"}: {s.signerName}
                          </div>
                        ))}
                      </div>
                    )}

                    {!fullySigned && availableSignerTypes.length > 0 && (
                      <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="signerType">Signer</Label>
                            <NativeSelect id="signerType" value={signerType} onChange={(e) => setSignerType(e.target.value as SignerType)}>
                              {availableSignerTypes.map((t) => (
                                <option key={t} value={t}>
                                  {t === "customer" ? "Customer" : "Employee"}
                                </option>
                              ))}
                            </NativeSelect>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="signerName">Full name</Label>
                            <Input id="signerName" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Type full legal name" />
                          </div>
                        </div>
                        <label className="flex items-start gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={signerConfirmed}
                            onChange={(e) => setSignerConfirmed(e.target.checked)}
                            className="mt-0.5 size-4 rounded border-border"
                          />
                          I confirm this represents {signerName.trim() || "the signer"}&apos;s agreement to this contract.
                        </label>
                        <div className="flex justify-end">
                          <Button type="button" size="sm" disabled={contractPending || !signerName.trim() || !signerConfirmed} onClick={submitSignature}>
                            {contractPending ? <Loader2 className="animate-spin" /> : <PenLine />}
                            Record signature
                          </Button>
                        </div>
                      </div>
                    )}

                    {fullySigned && (
                      <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="size-4" />
                        Contract fully signed.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Start rental</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {!fullySigned && contractId && (
                  <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    <AlertTriangle className="size-4 shrink-0" />
                    The contract isn&apos;t fully signed yet — you can still start the rental now and finish signing later.
                  </p>
                )}

                {showOverride && (
                  <div className="flex flex-col gap-2 rounded-2xl border border-amber-300 p-3 dark:border-amber-500/40">
                    <p className="text-sm font-medium text-foreground">Override reason required</p>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      rows={2}
                      className="flex w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                      placeholder="Why are you activating without a completed pickup inspection?"
                    />
                  </div>
                )}

                {contractError && (
                  <p className="text-sm text-destructive" role="alert">
                    {contractError}
                  </p>
                )}

                <Button
                  type="button"
                  size="lg"
                  disabled={activatePending || activateDone}
                  onClick={() => startRental(showOverride ? overrideReason : undefined)}
                >
                  {activatePending && <Loader2 className="animate-spin" />}
                  Start rental
                </Button>
                <p className="text-center text-xs text-muted-foreground">The vehicle will be marked rented and the reservation becomes active.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <WizardFooter
        onBack={() => setStep((s) => Math.max(0, s - 1))}
        backDisabled={step === 0 || step >= 2}
        onContinue={step === 0 ? () => selectedCustomer && setStep(1) : step === 2 ? () => setStep(3) : step === 3 ? saveInspectionStep : undefined}
        continueLabel={step === 2 ? "Continue to inspection" : step === 3 ? "Continue to contract" : undefined}
        continuePending={step === 3 && inspectionPending}
        continueDisabled={(step === 0 && (customerMode !== "search" || !selectedCustomer)) || (step === 3 && inspectionPending)}
        hideContinue={step === 1 || step === 4}
      />
    </div>
  )
}

export { NewRentalWizard }
