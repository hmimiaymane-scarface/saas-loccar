import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getContract, getSignaturesForContract, getAmendmentsForContract } from "@/lib/contracts/template-store"
import { logContractViewedAction } from "@/app/(dashboard)/contract-templates/actions"
import { isSupabaseConfigured } from "@/lib/env"
import { STORAGE_BUCKET } from "@/lib/storage"
import { formatDateTime } from "@/lib/format"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ContractStatusBadge } from "@/components/domain/contracts/contract-status-badge"
import { ContractLifecycleActions } from "@/components/domain/contracts/contract-lifecycle-actions"
import { ContractSignatureSection } from "@/components/domain/contracts/contract-signature-section"
import { ContractAmendmentSection } from "@/components/domain/contracts/contract-amendment-section"
import { ContractPdfActions } from "@/components/domain/contracts/contract-pdf-actions"

export default async function ContractViewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/overview")

  const { id } = await params
  // No mock-mode branch here (unlike lib/data.ts's reads) — this whole
  // domain is live-Supabase-only, and there's no organic way to reach a
  // real contract id in mock mode anyway (generation is a mutation).
  if (!isSupabaseConfigured) notFound()
  const supabase = await createClient()
  const contract = await getContract(supabase, session.company.id, id)
  if (!contract) notFound()

  const [signatures, amendments] = await Promise.all([
    getSignaturesForContract(supabase, session.company.id, id),
    getAmendmentsForContract(supabase, session.company.id, id),
  ])

  let pdfUrl: string | null = null
  if (contract.pdfStoragePath) {
    const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(contract.pdfStoragePath, 3600)
    pdfUrl = data?.signedUrl ?? null
  }

  // Best-effort, fire-and-forget — a failed view log must never break
  // the page itself (same convention as every best-effort event
  // elsewhere in this codebase).
  logContractViewedAction(id).catch(() => {})

  return (
    <>
      <SectionHeader
        title={contract.contractNumber ?? "Generated contract"}
        description={`Generated ${formatDateTime(contract.generatedAt)}${contract.generatedByName ? ` by ${contract.generatedByName}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/reservations/${contract.reservationId}`}>Back to reservation</Link>
            </Button>
            <ContractPdfActions
              contractId={contract.id}
              pdfUrl={pdfUrl}
              customerId={contract.customerId}
              customerName={contract.resolvedContext["customer.fullName"] ?? "there"}
              customerPhone={contract.resolvedContext["customer.phone"] ?? null}
              reservationId={contract.reservationId}
              reservationReference={contract.resolvedContext["reservation.reference"] ?? ""}
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Status</CardTitle>
              <ContractStatusBadge status={contract.status} />
            </CardHeader>
            <CardContent>
              <ContractLifecycleActions contractId={contract.id} status={contract.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contract text</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {contract.renderedSections.map((section) => (
                <div key={section.id} className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{section.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <ContractAmendmentSection contractId={contract.id} amendments={amendments} />
        </div>

        <div className="flex flex-col gap-4">
          <ContractSignatureSection
            contractId={contract.id}
            companyId={session.company.id}
            status={contract.status}
            signatures={signatures}
          />

          {contract.cancelledReason && (
            <Card>
              <CardHeader>
                <CardTitle>Cancellation reason</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{contract.cancelledReason}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
