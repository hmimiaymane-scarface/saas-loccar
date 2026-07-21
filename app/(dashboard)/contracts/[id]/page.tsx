import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Download } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getContract } from "@/lib/contracts/template-store"
import { isSupabaseConfigured } from "@/lib/env"
import { STORAGE_BUCKET } from "@/lib/storage"
import { formatDateTime } from "@/lib/format"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

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

  let pdfUrl: string | null = null
  if (contract.pdfStoragePath) {
    const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(contract.pdfStoragePath, 3600)
    pdfUrl = data?.signedUrl ?? null
  }

  return (
    <>
      <SectionHeader
        title="Generated contract"
        description={`Generated ${formatDateTime(contract.generatedAt)}${contract.generatedByName ? ` by ${contract.generatedByName}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`/reservations/${contract.reservationId}`}>Back to reservation</Link>
            </Button>
            {pdfUrl && (
              <Button asChild>
                <a href={pdfUrl} target="_blank" rel="noreferrer">
                  <Download />
                  Download PDF
                </a>
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          {contract.renderedSections.map((section) => (
            <div key={section.id} className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{section.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
