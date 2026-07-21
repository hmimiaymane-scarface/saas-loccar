import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, FileSignature } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { listTemplates, type TemplateRecord } from "@/lib/contracts/template-store"
import { isSupabaseConfigured } from "@/lib/env"
import { SectionHeader } from "@/components/domain/section-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

/** Same degrade-to-empty convention as every other AI/database-only
 * feature's mock-mode handling on this page's peers (fleet, customers)
 * — this whole domain is live-Supabase-only (see docs/contracts.md),
 * so mock mode shows an empty list rather than crashing the page. */
async function loadTemplates(companyId: string): Promise<TemplateRecord[]> {
  if (!isSupabaseConfigured) return []
  try {
    const supabase = await createClient()
    return await listTemplates(supabase, companyId)
  } catch {
    return []
  }
}

export default async function ContractTemplatesPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  const templates = await loadTemplates(session.company.id)

  return (
    <>
      <SectionHeader
        title="Contract Templates"
        description="Upload your own rental agreement once — every generated contract fills it in from real reservation data."
        actions={
          <Button asChild>
            <Link href="/contract-templates/new">
              <Plus />
              Upload template
            </Link>
          </Button>
        }
      />

      {templates.length === 0 ? (
        <EmptyPlaceholder
          icon={FileSignature}
          title="No templates yet"
          description="Upload an existing contract PDF to get started — the AI service proposes a variable mapping for you to review."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((t) => (
            <Link key={t.id} href={`/contract-templates/${t.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">{t.name}</span>
                    <span className="text-xs text-muted-foreground uppercase">{t.language}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t.activeVersionId ? "Active" : "No active version — needs review"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
