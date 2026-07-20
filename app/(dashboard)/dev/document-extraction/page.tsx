import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getDocumentsList } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardContent } from "@/components/ui/card"
import { ExtractRow } from "./extract-row"

// Internal engineering tool for roadmap phase 03 (Document Intelligence
// Engine) — manually trigger extraction against real uploaded documents
// and see the result rendered through phase 02's DocumentConfidenceRow.
// Not linked from any navigation; reachable by URL only, behind the
// normal dashboard auth gate.
const SUPPORTED_CATEGORIES = ["identity_document", "driving_licence", "vehicle_registration", "insurance_document"] as const

export default async function DocumentExtractionDemoPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const { items: documents } = await getDocumentsList(session.company.id, {}, 1, 100)
  const eligible = documents.filter((doc) => (SUPPORTED_CATEGORIES as readonly string[]).includes(doc.category))

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Document extraction"
        description="Manually run extraction against real uploaded documents — not linked from navigation."
      />
      <Card>
        <CardContent className="flex flex-col">
          {eligible.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No identity, driving licence, vehicle registration, or insurance documents uploaded yet — upload one
              from /documents first.
            </p>
          ) : (
            eligible.map((doc) => (
              <ExtractRow key={doc.id} documentId={doc.id} filename={doc.originalFilename} category={doc.category} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
