"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, AlertTriangle, Camera, ZoomIn } from "lucide-react"

import { createCustomer } from "@/app/(dashboard)/customers/actions"
import { createDocumentRecord } from "@/app/(dashboard)/documents/actions"
import { buildStoragePath, validateFile, ACCEPTED_IMAGE_MIME_TYPES } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { resolveInitialStep } from "@/lib/workflow/steps"
import { useStepFocus } from "@/hooks/use-step-focus"
import { CATEGORY_OPTIONS } from "@/lib/document-categories"
import { confidenceTier } from "@/lib/tone"
import type { ExtractedFields } from "@/lib/document-extraction"
import type { DuplicateMatch } from "@/lib/customer-matching"
import type { DocumentCategory } from "@/types/rental"
import { SummaryRow } from "@/components/domain/summary-row"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { WizardProgress } from "@/components/domain/wizard-progress"
import { WizardFooter } from "@/components/domain/wizard-footer"
import { DocumentConfidenceRow } from "@/components/domain/intelligence/document-confidence-row"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DocumentScanCapture, type ScanCaptureResult } from "@/components/domain/customers/document-scan-capture"

const STEPS = [{ label: "Identity" }, { label: "Driving licence" }, { label: "Contact" }, { label: "Review" }]

function categoryLabel(category: DocumentCategory): string {
  return CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category
}

function textValue(fields: ExtractedFields | null, key: string): string {
  const field = fields?.[key]
  if (!field || field.value == null) return ""
  return String(field.value)
}

/** How many of `keys` extracted at critical (low) confidence — the
 * count behind both phase 19's auto-advance signal and phase 21's
 * confidence-review summary line. */
function countCriticalFields(fields: ExtractedFields, keys: string[]): number {
  return keys.filter((key) => confidenceTier(fields[key]?.confidence ?? 0) === "critical").length
}

/** Phase 19 — "nothing left to review" is the signal that a scanned
 * step can safely auto-advance; a single critical-confidence field
 * means the user still needs to see and fix it, so stay put. */
function hasCriticalField(fields: ExtractedFields, keys: string[]): boolean {
  return countCriticalFields(fields, keys) > 0
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

/** Phase 21 — "understand immediately whether the photo is usable":
 * one sentence above the confidence rows instead of making the owner
 * scan each row themselves to notice a problem. Phase 22 adds "Next
 * issue" — jump directly to the next uncertain field instead of
 * scrolling to find it. */
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

/** Bible Chapter 6 §3 / Chapter 4 §2-3 — camera-first new-customer intake
 * (roadmap phase 14). Follows the same hand-rolled wizard pattern as
 * components/domain/pickup/pickup-wizard.tsx (STEPS array,
 * resolveInitialStep, WizardProgress/WizardFooter, useStepFocus) rather
 * than inventing a new one — this app has no generic workflow engine,
 * just a handful of shared pieces every stepped flow reuses.
 *
 * Camera-first, never camera-only: every scanned field is a normal
 * controlled input underneath, so an employee can always type instead
 * of (or in addition to) scanning — see the manual Field inputs
 * alongside each DocumentScanCapture button.
 *
 * Duplicate detection (phase 08's Merge/Keep Separate/Review Later
 * flow) isn't re-run after each scan — it fires once, at the existing,
 * proven moment: createCustomer's own check right before insert. Since
 * nothing is persisted until the final Review step submits, that single
 * check already satisfies "interrupt before creating a duplicate
 * record" without a second, divergent duplicate-detection surface
 * earlier in the flow.
 */
function CustomerOnboardingWizard({ companyId, returnTo }: { companyId: string; returnTo?: string }) {
  const router = useRouter()
  const [step, setStep] = useState(() => resolveInitialStep([false, false, false, false]))
  const stepContainerRef = useStepFocus<HTMLDivElement>(step)

  // Identity ----------------------------------------------------------
  const [fullName, setFullName] = useState("")
  const [nationality, setNationality] = useState("")
  const [dateOfBirth, setDateOfBirth] = useState("")
  const [idDocumentNumber, setIdDocumentNumber] = useState("")
  const [idFields, setIdFields] = useState<ExtractedFields | null>(null)
  const [idScanFile, setIdScanFile] = useState<File | null>(null)
  const [idScanNotice, setIdScanNotice] = useState<string | null>(null)

  // Phase 22 — "original image remains easy to inspect": derived from
  // the already-captured file (no change needed to the capture
  // handlers themselves) via useMemo (React's own "you might not need
  // an effect" guidance for state derivable during render) — a plain
  // effect below only handles revoking the URL, never setState.
  const idPreviewUrl = useMemo(() => (idScanFile ? URL.createObjectURL(idScanFile) : null), [idScanFile])
  useEffect(() => () => { if (idPreviewUrl) URL.revokeObjectURL(idPreviewUrl) }, [idPreviewUrl])

  // Driving licence -----------------------------------------------------
  const [licenseNumber, setLicenseNumber] = useState("")
  const [licenseExpiresOn, setLicenseExpiresOn] = useState("")
  const [licenceFields, setLicenceFields] = useState<ExtractedFields | null>(null)
  const [licenceScanFile, setLicenceScanFile] = useState<File | null>(null)
  const [licenceScanNotice, setLicenceScanNotice] = useState<string | null>(null)
  const licencePreviewUrl = useMemo(() => (licenceScanFile ? URL.createObjectURL(licenceScanFile) : null), [licenceScanFile])
  useEffect(() => () => { if (licencePreviewUrl) URL.revokeObjectURL(licencePreviewUrl) }, [licencePreviewUrl])

  // Phase 22 — "never silently overwrite corrected user data": a field
  // the user has actually typed into is protected from being clobbered
  // by a later re-scan (e.g. after "Retake"). Only fields with no
  // shared cross-scan concern need this (fullName is protected the
  // simpler way below, by never overwriting a value that's already
  // set, since it's populated by either scan). Each row's onChange
  // marks its own key inline (rather than a shared factory function)
  // so a ref is only ever touched inside an actual event handler.
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

  // Contact & consent ---------------------------------------------------
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [selfieError, setSelfieError] = useState<string | null>(null)

  // Review / submit -----------------------------------------------------
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateMatch[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [savingDocuments, setSavingDocuments] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleIdCaptured(file: File, result: ScanCaptureResult) {
    setIdScanFile(file)
    if (!result.ok) {
      setIdScanNotice(result.message)
      return
    }
    if (result.category !== "identity_document") {
      setIdScanNotice(
        `This looks like a ${categoryLabel(result.category).toLowerCase()}, not an identity document — check the photo, or fill in the fields below by hand.`
      )
      return
    }
    setIdScanNotice(null)
    if (result.fields) {
      if (!fullName) setFullName(textValue(result.fields, "fullName"))
      if (!manuallyEditedRef.current.has("idNumber")) setIdDocumentNumber(textValue(result.fields, "idNumber"))
      if (!manuallyEditedRef.current.has("birthDate")) setDateOfBirth(textValue(result.fields, "birthDate"))
      if (!manuallyEditedRef.current.has("nationality")) setNationality(textValue(result.fields, "nationality"))
      setIdFields(result.fields)
      if (!hasCriticalField(result.fields, ["fullName", "idNumber", "birthDate", "nationality"])) {
        setStep(1)
      }
    }
  }

  function handleLicenceCaptured(file: File, result: ScanCaptureResult) {
    setLicenceScanFile(file)
    if (!result.ok) {
      setLicenceScanNotice(result.message)
      return
    }
    if (result.category !== "driving_licence") {
      setLicenceScanNotice(
        `This looks like a ${categoryLabel(result.category).toLowerCase()}, not a driving licence — check the photo, or fill in the fields below by hand.`
      )
      return
    }
    setLicenceScanNotice(null)
    if (result.fields) {
      if (!fullName) setFullName(textValue(result.fields, "fullName"))
      if (!manuallyEditedRef.current.has("licenceNumber")) setLicenseNumber(textValue(result.fields, "licenceNumber"))
      if (!manuallyEditedRef.current.has("expiryDate")) setLicenseExpiresOn(textValue(result.fields, "expiryDate"))
      setLicenceFields(result.fields)
      if (!hasCriticalField(result.fields, ["licenceNumber", "expiryDate"])) {
        setStep(2)
      }
    }
  }

  function handleSelfieFile(file: File) {
    setSelfieError(null)
    const validationError = validateFile(file, ACCEPTED_IMAGE_MIME_TYPES)
    if (validationError) {
      setSelfieError(validationError)
      return
    }
    setSelfieFile(file)
  }

  function buildCustomerFormData(acknowledgeDuplicates: boolean): FormData {
    const fd = new FormData()
    fd.set("fullName", fullName)
    fd.set("phone", phone)
    if (email) fd.set("email", email)
    if (nationality) fd.set("nationality", nationality)
    if (idDocumentNumber) fd.set("idDocumentNumber", idDocumentNumber)
    if (licenseNumber) fd.set("licenseNumber", licenseNumber)
    if (licenseExpiresOn) fd.set("licenseExpiresOn", licenseExpiresOn)
    if (dateOfBirth) fd.set("dateOfBirth", dateOfBirth)
    if (address) fd.set("address", address)
    fd.set("marketingConsent", marketingConsent ? "true" : "false")
    fd.set("acknowledgeDuplicates", acknowledgeDuplicates ? "true" : "false")
    return fd
  }

  async function attachScannedDocuments(customerId: string) {
    const uploads: { file: File; category: DocumentCategory; notes?: string }[] = []
    if (idScanFile) uploads.push({ file: idScanFile, category: "identity_document" })
    if (licenceScanFile) uploads.push({ file: licenceScanFile, category: "driving_licence" })
    if (selfieFile) uploads.push({ file: selfieFile, category: "other", notes: "Customer photo (onboarding)" })
    if (uploads.length === 0) return

    setSavingDocuments(true)
    for (const { file, category, notes } of uploads) {
      const path = buildStoragePath(companyId, ["customers", customerId], file.name)
      const upload = await uploadFile(path, file)
      if (upload.error) continue
      await createDocumentRecord({
        category,
        storagePath: path,
        originalFilename: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        customerId,
        notes,
      })
    }
    setSavingDocuments(false)
  }

  function handleSubmit(acknowledgeDuplicates: boolean) {
    setSubmitError(null)
    startTransition(async () => {
      const result = await createCustomer({}, buildCustomerFormData(acknowledgeDuplicates))
      if (result.error) {
        setSubmitError(result.error)
        return
      }
      if (result.duplicateCandidates && result.duplicateCandidates.length > 0) {
        setDuplicateCandidates(result.duplicateCandidates)
        return
      }
      if (result.customerId) {
        setDuplicateCandidates([])
        await attachScannedDocuments(result.customerId)
        router.push(returnTo ? `${returnTo}?customerId=${result.customerId}` : `/customers/${result.customerId}`)
      }
    })
  }

  const busy = isPending || savingDocuments

  return (
    <div className="flex flex-col gap-6">
      <WizardProgress steps={STEPS} currentStep={step} />

      <div key={step} ref={stepContainerRef} className="flex flex-col gap-4 animate-in fade-in-0 duration-200">
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
              <CardDescription>Scan a national ID or passport, or enter the details by hand.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
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
              {idFields ? (
                <div className="flex flex-col gap-2">
                  <ConfidenceSummary
                    criticalCount={countCriticalFields(idFields, ["fullName", "idNumber", "birthDate", "nationality"])}
                    onNext={() =>
                      goToNextIssue(idFields, ["fullName", "idNumber", "birthDate", "nationality"], idRowRefs.current, idIssueIndex, setIdIssueIndex)
                    }
                  />
                  <div className="flex flex-col divide-y divide-border rounded-2xl bg-muted/40 px-3">
                    <DocumentConfidenceRow
                      ref={(el) => { idRowRefs.current.fullName = el }}
                      label="Full name"
                      value={fullName}
                      confidence={idFields.fullName?.confidence ?? 0}
                      onChange={setFullName}
                    />
                    <DocumentConfidenceRow
                      ref={(el) => { idRowRefs.current.idNumber = el }}
                      label="ID number"
                      value={idDocumentNumber}
                      confidence={idFields.idNumber?.confidence ?? 0}
                      onChange={(v) => { manuallyEditedRef.current.add("idNumber"); setIdDocumentNumber(v) }}
                    />
                    <DocumentConfidenceRow
                      ref={(el) => { idRowRefs.current.birthDate = el }}
                      label="Date of birth"
                      value={dateOfBirth}
                      confidence={idFields.birthDate?.confidence ?? 0}
                      onChange={(v) => { manuallyEditedRef.current.add("birthDate"); setDateOfBirth(v) }}
                    />
                    <DocumentConfidenceRow
                      ref={(el) => { idRowRefs.current.nationality = el }}
                      label="Nationality"
                      value={nationality}
                      confidence={idFields.nationality?.confidence ?? 0}
                      onChange={(v) => { manuallyEditedRef.current.add("nationality"); setNationality(v) }}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Full name"
                    name="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Youssef El Amrani"
                    required
                  />
                  <Field label="Nationality" name="nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="Optional" />
                  <Field label="Date of birth" name="dateOfBirth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                  <Field label="ID document number" name="idDocumentNumber" value={idDocumentNumber} onChange={(e) => setIdDocumentNumber(e.target.value)} placeholder="Optional" />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Driving licence</CardTitle>
              <CardDescription>Optional — you can add this later. Scan it now, or enter the details by hand.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
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
              {licenceFields ? (
                <div className="flex flex-col gap-2">
                  <ConfidenceSummary
                    criticalCount={countCriticalFields(licenceFields, ["licenceNumber", "expiryDate"])}
                    onNext={() => goToNextIssue(licenceFields, ["licenceNumber", "expiryDate"], licenceRowRefs.current, licenceIssueIndex, setLicenceIssueIndex)}
                  />
                  <div className="flex flex-col divide-y divide-border rounded-2xl bg-muted/40 px-3">
                    <DocumentConfidenceRow
                      ref={(el) => { licenceRowRefs.current.licenceNumber = el }}
                      label="Licence number"
                      value={licenseNumber}
                      confidence={licenceFields.licenceNumber?.confidence ?? 0}
                      onChange={(v) => { manuallyEditedRef.current.add("licenceNumber"); setLicenseNumber(v) }}
                    />
                    <DocumentConfidenceRow
                      ref={(el) => { licenceRowRefs.current.expiryDate = el }}
                      label="Expires on"
                      value={licenseExpiresOn}
                      confidence={licenceFields.expiryDate?.confidence ?? 0}
                      onChange={(v) => { manuallyEditedRef.current.add("expiryDate"); setLicenseExpiresOn(v) }}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Licence number" name="licenseNumber" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
                  <Field label="Licence expires" name="licenseExpiresOn" type="date" value={licenseExpiresOn} onChange={(e) => setLicenseExpiresOn(e.target.value)} />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Phone"
                name="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+212 6XX-XXXXXX"
                required
              />
              <Field label="Email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
              <div className="sm:col-span-2">
                <Field label="Address" name="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                <Checkbox checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} />
                Customer has consented to marketing communications
              </label>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label>Photo (optional)</Label>
                <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-dashed border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleSelfieFile(file)
                      e.target.value = ""
                    }}
                  />
                  <Camera className="size-3.5" />
                  {selfieFile ? "Retake photo" : "Take photo"}
                </label>
                {selfieError && <p className="text-xs text-destructive">{selfieError}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Review</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <SummaryRow label="Name" value={fullName || "Not entered"} />
                <SummaryRow label="Phone" value={phone || "Not entered"} />
                <SummaryRow label="ID number" value={idDocumentNumber || "Not entered"} />
                <SummaryRow label="Licence number" value={licenseNumber || "Not entered"} />
              </CardContent>
            </Card>

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
                      <Button type="button" variant="ghost" size="sm" asChild>
                        <a href={returnTo ? `${returnTo}?customerId=${candidate.customerId}` : `/customers/${candidate.customerId}`}>
                          Use them
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => handleSubmit(true)}
                  >
                    {isPending && <Loader2 className="animate-spin" />}
                    Not a duplicate — create anyway
                  </Button>
                </div>
              </div>
            )}

            {submitError && (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            )}

            {duplicateCandidates.length === 0 && (
              <div className="flex justify-end">
                <Button type="button" disabled={busy || !fullName.trim() || !phone.trim()} onClick={() => handleSubmit(false)}>
                  {busy && <Loader2 className="animate-spin" />}
                  {savingDocuments ? "Saving documents…" : "Create profile"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <WizardFooter
        onBack={() => setStep((s) => Math.max(0, s - 1))}
        backDisabled={step === 0 || busy}
        onContinue={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
        continueDisabled={busy || (step === 0 && !fullName.trim()) || (step === 2 && !phone.trim())}
        hideContinue={step === STEPS.length - 1}
      />
    </div>
  )
}

export { CustomerOnboardingWizard }
