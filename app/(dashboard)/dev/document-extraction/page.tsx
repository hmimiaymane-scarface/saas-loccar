import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getDocumentsList } from "@/lib/data"
import { getExpiringDocuments, type ExpiringDocument } from "@/lib/documents"
import { createClient } from "@/lib/supabase/server"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ExtractRow } from "./extract-row"
import { DuplicateCheckPanel } from "./duplicate-check-panel"
import { ConsistencyCheckPanel } from "./consistency-check-panel"

// Internal engineering tool for roadmap phase 03 (Document Intelligence
// Engine) and phase 04 (Classification, Expiry & Relationships) —
// manually trigger extraction/classification against real uploaded
// documents and exercise the phase 04 detection queries. Not linked
// from any navigation; reachable by URL only, behind the normal
// dashboard auth gate.
const SUPPORTED_CATEGORIES = ["identity_document", "driving_licence", "vehicle_registration", "insurance_document"] as const

async function loadExpiringDocuments(companyId: string): Promise<{ items: ExpiringDocument[]; error: string | null }> {
  try {
    const supabase = await createClient()
    return { items: await getExpiringDocuments(supabase, companyId, 30), error: null }
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : "Could not load expiring documents." }
  }
}

export default async function DocumentExtractionDemoPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const [{ items: documents }, expiring] = await Promise.all([
    getDocumentsList(session.company.id, {}, 1, 100),
    loadExpiringDocuments(session.company.id),
  ])
  const eligible = documents.filter((doc) => (SUPPORTED_CATEGORIES as readonly string[]).includes(doc.category))

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Document extraction"
        description="Manually run extraction/classification against real uploaded documents, and exercise phase 04's detection queries — not linked from navigation."
      />

      <Card>
        <CardHeader>
          <CardTitle>Extraction &amp; classification</CardTitle>
          <CardDescription>Requirement 1 — automatic classification, reusing phase 03&apos;s extraction pipeline.</CardDescription>
        </CardHeader>
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

      <Card>
        <CardHeader>
          <CardTitle>Expiring documents (next 30 days)</CardTitle>
          <CardDescription>Requirement 4 — getExpiringDocuments(), the query phase 12&apos;s Operations Feed will consume.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {expiring.error && <p className="text-sm text-destructive">{expiring.error}</p>}
          {!expiring.error && expiring.items.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing expiring in the next 30 days.</p>
          )}
          {expiring.items.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <span>
                {doc.originalFilename} <span className="text-muted-foreground">({doc.category})</span>
              </span>
              <span className="text-muted-foreground">{doc.expiresOn}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate customer check</CardTitle>
          <CardDescription>
            Requirement 5 — findDuplicateCandidates(). Works without a live Supabase project (scores against the mock
            customer fixtures).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DuplicateCheckPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cross-document consistency check</CardTitle>
          <CardDescription>Requirement 6 — getConsistencyIssuesForCustomer(). Requires a live Supabase project.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConsistencyCheckPanel />
        </CardContent>
      </Card>
    </div>
  )
}
