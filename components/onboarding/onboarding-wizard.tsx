"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload, Copy, Check } from "lucide-react"

import {
  createCompany,
  updateCompanyLogo,
  updateRentalDefaults,
  type OnboardingActionState,
} from "@/app/onboarding/actions"
import { inviteMember, type TeamActionState } from "@/app/(dashboard)/employees/actions"
import { buildStoragePath, validateFile, ACCEPTED_IMAGE_MIME_TYPES } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { WizardProgress } from "@/components/domain/wizard-progress"
import { TemplateUploadForm } from "@/components/domain/contracts/template-upload-form"

const STEPS = [
  { label: "Company" },
  { label: "Logo" },
  { label: "Defaults" },
  { label: "Contract" },
  { label: "Team" },
]

const initialOnboardingState: OnboardingActionState = {}

/**
 * Roadmap phase 47 — replaces the single-screen `OnboardingForm` with
 * a 5-step wizard covering the brief's full collect-list (name/logo/
 * contact/currency/rental-rules/deposit/contract-template/staff
 * invite). Only step 1 is required — it's the one step that has to
 * happen before a company exists at all; every later step has a
 * "Skip" affordance, since none of them block "reach a usable
 * dashboard" (this phase's own acceptance criterion) the way step 1
 * genuinely does.
 *
 * Deliberately entirely client-state-driven (`step`), not one route
 * per step — the company itself is created after step 1 and every
 * later step is a normal authenticated write against it, so there's
 * no risk of losing progress by staying on one page; a refresh mid-
 * wizard just re-shows step 1 (the company already exists by then,
 * which is a safe, resumable state — not "lost data").
 */
function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [companyId, setCompanyId] = useState<string | null>(null)

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <WizardProgress steps={STEPS} currentStep={step} />
      {step === 0 && (
        <CompanyStep
          onDone={(id) => {
            setCompanyId(id)
            setStep(1)
          }}
        />
      )}
      {step === 1 && <LogoStep companyId={companyId} onNext={() => setStep(2)} />}
      {step === 2 && <DefaultsStep onNext={() => setStep(3)} />}
      {step === 3 && <ContractStep companyId={companyId} onNext={() => setStep(4)} />}
      {step === 4 && <InviteStep onFinish={() => router.push("/overview")} />}
    </div>
  )
}

function CompanyStep({ onDone }: { onDone: (companyId: string) => void }) {
  const [state, formAction, isPending] = useActionState(createCompany, initialOnboardingState)

  useEffect(() => {
    if (state.companyCreated && state.companyId) onDone(state.companyId)
    // onDone is a fresh inline function from the parent every render;
    // this should only re-run when the action's own result actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.companyCreated, state.companyId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Set up your company</CardTitle>
        <CardDescription>A few details to create your workspace — you can refine everything later in Settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Company name</Label>
            <Input id="name" name="name" placeholder="Atlas Rent Car" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" placeholder="Marrakech" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" placeholder="+212 6XX-XXXXXX" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <NativeSelect id="currency" name="currency" defaultValue="MAD">
                <option value="MAD">MAD — Moroccan dirham</option>
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — US dollar</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="language">Language</Label>
              <NativeSelect id="language" name="language" defaultValue="fr">
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </NativeSelect>
            </div>
          </div>

          {state.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="mt-1 w-full">
            {isPending && <Loader2 className="animate-spin" />}
            Create workspace
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function StepShell({
  title,
  description,
  children,
  onSkip,
  skipLabel = "Skip for now",
}: {
  title: string
  description: string
  children: React.ReactNode
  onSkip: () => void
  skipLabel?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {children}
        <Button type="button" variant="ghost" onClick={onSkip} className="w-full">
          {skipLabel}
        </Button>
      </CardContent>
    </Card>
  )
}

function LogoStep({ companyId, onNext }: { companyId: string | null; onNext: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload() {
    if (!file || !companyId) return
    const validationError = validateFile(file, ACCEPTED_IMAGE_MIME_TYPES)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setBusy(true)
    // Same buildStoragePath convention every other upload in this app
    // uses — scoped under this company's own prefix, not a shared one.
    const path = buildStoragePath(companyId, ["logo"], file.name)
    const upload = await uploadFile(path, file)
    if (upload.error) {
      setError(upload.error)
      setBusy(false)
      return
    }
    const result = await updateCompanyLogo(upload.path)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onNext()
  }

  return (
    <StepShell title="Add your logo" description="Shown in the sidebar — you can add or change this anytime from Settings." onSkip={onNext}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logo">Logo (image)</Label>
        <Input id="logo" type="file" accept={ACCEPTED_IMAGE_MIME_TYPES.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="button" onClick={handleUpload} disabled={!file || !companyId || busy} className="w-full">
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        Upload and continue
      </Button>
    </StepShell>
  )
}

function DefaultsStep({ onNext }: { onNext: () => void }) {
  const [deposit, setDeposit] = useState("")
  const [gracePeriod, setGracePeriod] = useState("0")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    setBusy(true)
    const result = await updateRentalDefaults({
      defaultDepositMad: deposit ? Number(deposit) : null,
      overdueGracePeriodHours: Number(gracePeriod) || 0,
    })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onNext()
  }

  return (
    <StepShell
      title="Rental defaults"
      description="A starting point for every new reservation — nothing here is locked in, and each reservation can still override it."
      onSkip={onNext}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="deposit">Default deposit (MAD)</Label>
        <Input
          id="deposit"
          type="number"
          min="0"
          step="0.01"
          placeholder="e.g. 3000"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gracePeriod">Overdue grace period (hours)</Label>
        <Input
          id="gracePeriod"
          type="number"
          min="0"
          max="168"
          value={gracePeriod}
          onChange={(e) => setGracePeriod(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          How long past the scheduled return time before a rental is flagged as overdue. 0 means immediately.
        </p>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="button" onClick={handleSave} disabled={busy} className="w-full">
        {busy && <Loader2 className="animate-spin" />}
        Save and continue
      </Button>
    </StepShell>
  )
}

function ContractStep({ companyId, onNext }: { companyId: string | null; onNext: () => void }) {
  return (
    <StepShell
      title="Contract template"
      description="Upload an existing rental agreement (PDF) and RentalOS will propose where each field goes — you can always do this later from Contract templates."
      onSkip={onNext}
      skipLabel="Skip — I'll do this later"
    >
      {companyId && <TemplateUploadForm companyId={companyId} />}
    </StepShell>
  )
}

function InviteStep({ onFinish }: { onFinish: () => void }) {
  const initialState: TeamActionState = {}
  const [state, formAction, isPending] = useActionState(inviteMember, initialState)
  const [copied, setCopied] = useState(false)

  const inviteUrl = state.token && typeof window !== "undefined" ? `${window.location.origin}/invite/${state.token}` : null

  async function handleCopy() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
  }

  if (inviteUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invite sent</CardTitle>
          <CardDescription>
            RentalOS doesn&apos;t send emails yet — share this link with your teammate however&apos;s easiest (WhatsApp, SMS, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{inviteUrl}</span>
            <Button type="button" variant="ghost" size="icon-sm" onClick={handleCopy} aria-label="Copy link">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <Button type="button" onClick={onFinish} className="w-full">
            Finish
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <StepShell
      title="Invite a teammate"
      description="Optional — bring a manager or agent in now, or do this anytime from Team."
      onSkip={onFinish}
      skipLabel="Skip — go to my dashboard"
    >
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inviteEmail">Email</Label>
          <Input id="inviteEmail" name="email" type="email" placeholder="colleague@example.com" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inviteRole">Role</Label>
          <NativeSelect id="inviteRole" name="role" defaultValue="manager">
            <option value="manager">Manager</option>
            <option value="agent">Agent</option>
            <option value="accountant">Accountant</option>
          </NativeSelect>
        </div>
        {state.error && (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending && <Loader2 className="animate-spin" />}
          Send invite
        </Button>
      </form>
    </StepShell>
  )
}

export { OnboardingWizard }
