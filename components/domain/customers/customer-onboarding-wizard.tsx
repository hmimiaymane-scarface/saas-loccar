"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, AlertTriangle, Camera } from "lucide-react"

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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { WizardProgress } from "@/components/domain/wizard-progress"
import { WizardFooter } from "@/components/domain/wizard-footer"
import { DocumentConfidenceRow } from "@/components/domain/intelligence/document-confidence-row"
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

/** Phase 19 — "nothing left to review" is the signal that a scanned
 * step can safely auto-advance; a single critical-confidence field
 * means the user still needs to see and fix it, so stay put. */
function hasCriticalField(fields: ExtractedFields, keys: string[]): boolean {
  return keys.some((key) => confidenceTier(fields[key]?.confidence ?? 0) === "critical")
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

  // Driving licence -----------------------------------------------------
  const [licenseNumber, setLicenseNumber] = useState("")
  const [licenseExpiresOn, setLicenseExpiresOn] = useState("")
  const [licenceFields, setLicenceFields] = useState<ExtractedFields | null>(null)
  const [licenceScanFile, setLicenceScanFile] = useState<File | null>(null)
  const [licenceScanNotice, setLicenceScanNotice] = useState<string | null>(null)

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
      setFullName(textValue(result.fields, "fullName"))
      setIdDocumentNumber(textValue(result.fields, "idNumber"))
      setDateOfBirth(textValue(result.fields, "birthDate"))
      setNationality(textValue(result.fields, "nationality"))
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
      setLicenseNumber(textValue(result.fields, "licenceNumber"))
      setLicenseExpiresOn(textValue(result.fields, "expiryDate"))
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

      <div ref={stepContainerRef} className="flex flex-col gap-4">
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
              <CardDescription>Scan a national ID or passport, or enter the details by hand.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <DocumentScanCapture label="Scan ID / passport" onCaptured={handleIdCaptured} />
              {idScanNotice && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {idScanNotice}
                </p>
              )}
              {idFields ? (
                <div className="flex flex-col divide-y divide-border rounded-2xl bg-muted/40 px-3">
                  <DocumentConfidenceRow
                    label="Full name"
                    value={fullName}
                    confidence={idFields.fullName?.confidence ?? 0}
                    onChange={setFullName}
                  />
                  <DocumentConfidenceRow
                    label="ID number"
                    value={idDocumentNumber}
                    confidence={idFields.idNumber?.confidence ?? 0}
                    onChange={setIdDocumentNumber}
                  />
                  <DocumentConfidenceRow
                    label="Date of birth"
                    value={dateOfBirth}
                    confidence={idFields.birthDate?.confidence ?? 0}
                    onChange={setDateOfBirth}
                  />
                  <DocumentConfidenceRow
                    label="Nationality"
                    value={nationality}
                    confidence={idFields.nationality?.confidence ?? 0}
                    onChange={setNationality}
                  />
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
              <DocumentScanCapture label="Scan driving licence" onCaptured={handleLicenceCaptured} />
              {licenceScanNotice && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {licenceScanNotice}
                </p>
              )}
              {licenceFields ? (
                <div className="flex flex-col divide-y divide-border rounded-2xl bg-muted/40 px-3">
                  <DocumentConfidenceRow
                    label="Licence number"
                    value={licenseNumber}
                    confidence={licenceFields.licenceNumber?.confidence ?? 0}
                    onChange={setLicenseNumber}
                  />
                  <DocumentConfidenceRow
                    label="Expires on"
                    value={licenseExpiresOn}
                    confidence={licenceFields.expiryDate?.confidence ?? 0}
                    onChange={setLicenseExpiresOn}
                  />
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
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="size-4 rounded border-input"
                />
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
