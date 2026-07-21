import { notFound, redirect } from "next/navigation"
import { AlertTriangle, Info, Sparkles } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getReservationDetail } from "@/lib/data"
import { previewContractAction } from "@/app/(dashboard)/contract-templates/actions"
import { CONTRACT_VARIABLE_CATALOG, type ContractVariableDef } from "@/lib/contracts/variables"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { GenerateContractConfirmButton } from "@/components/domain/contracts/generate-contract-confirm-button"

const GROUP_LABELS: Record<ContractVariableDef["group"], string> = {
  customer: "Customer",
  vehicle: "Vehicle",
  reservation: "Reservation",
  pricing: "Pricing",
  deposit: "Deposit",
  company: "Company",
  employee: "Employee",
  today: "Date",
  flags: "Computed flags",
}

/**
 * Roadmap phase 11 requirement 1 — "before generation, show a clear
 * preview distinguishing editable info, auto-generated info, legal
 * text, warnings, missing data, and inconsistencies... this is the
 * final verification step... it needs to actually be trustworthy, not
 * decorative." Read-only: `previewContractAction` never persists
 * anything, so this page can be reloaded freely without side effects.
 */
export default async function ContractPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/overview")

  const { id } = await params
  const reservation = await getReservationDetail(session.company.id, id)
  if (!reservation) notFound()

  const preview = await previewContractAction(id)

  if (!preview.ok) {
    return (
      <>
        <SectionHeader title="Contract preview" description={reservation.reference} />
        <Card>
          <CardContent className="flex items-center gap-2 pt-6 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {preview.error}
          </CardContent>
        </Card>
      </>
    )
  }

  const errors = preview.validationIssues.filter((i) => i.severity === "error")
  const warnings = preview.validationIssues.filter((i) => i.severity === "warning")
  const canGenerate = errors.length === 0

  const byGroup = new Map<ContractVariableDef["group"], { label: string; value: string }[]>()
  for (const variable of CONTRACT_VARIABLE_CATALOG) {
    const value = preview.context[variable.fieldPath]
    if (value == null || value === "") continue
    const list = byGroup.get(variable.group) ?? []
    list.push({ label: variable.label, value })
    byGroup.set(variable.group, list)
  }

  return (
    <>
      <SectionHeader
        title="Contract preview"
        description={`${reservation.reference} — nothing is saved until you confirm below`}
        actions={<GenerateContractConfirmButton reservationId={id} disabled={!canGenerate} />}
      />

      {errors.length > 0 && (
        <Card className="border-red-300 dark:border-red-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="size-4" />
              Missing data — generation is blocked
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {errors.map((issue, i) => (
              <p key={i} className="text-sm text-red-700 dark:text-red-400">
                {issue.message}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {(warnings.length > 0 || preview.aiWarnings.length > 0) && (
        <Card className="border-amber-300 dark:border-amber-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <Info className="size-4" />
              Worth a second look
            </CardTitle>
            <CardDescription>Advisory only — these don&apos;t block generation.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {warnings.map((issue, i) => (
              <p key={`v-${i}`} className="text-sm text-amber-800 dark:text-amber-300">
                {issue.message}
              </p>
            ))}
            {preview.aiWarnings.map((warning, i) => (
              <p key={`ai-${i}`} className="flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-300">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                {warning.message}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Auto-generated info</CardTitle>
          <CardDescription>Resolved from this reservation, customer, vehicle, and company — not editable here.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {[...byGroup.entries()].map(([group, rows]) => (
            <div key={group} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{GROUP_LABELS[group]}</span>
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="text-foreground">{row.value}</span>
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Legal text</CardTitle>
          <CardDescription>The contract sections exactly as they&apos;ll appear on the generated document.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {preview.renderedSections.map((section) => (
            <div key={section.id} className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{section.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
