import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Plus } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { listTemplates, getTemplateVersions } from "@/lib/contracts/template-store"
import { formatDateTime } from "@/lib/format"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  active: "Active",
  archived: "Archived",
}

export default async function ContractTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  const { id } = await params
  const supabase = await createClient()
  const [templates, versions] = await Promise.all([
    listTemplates(supabase, session.company.id),
    getTemplateVersions(supabase, session.company.id, id),
  ])
  const template = templates.find((t) => t.id === id)
  if (!template) notFound()

  return (
    <>
      <SectionHeader
        title={template.name}
        description={`${template.language.toUpperCase()} · every edit creates a new version — nothing is ever overwritten`}
        actions={
          versions.length > 0 && (
            <Button variant="outline" asChild>
              <Link href={`/contract-templates/${template.id}/versions/${versions[0].id}`}>
                <Plus />
                Edit latest version
              </Link>
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3">
        {versions.map((v) => (
          <Link key={v.id} href={`/contract-templates/${template.id}/versions/${v.id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    Version {v.versionNumber}
                    {v.id === template.activeVersionId ? " (in use for new contracts)" : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Created {formatDateTime(v.createdAt)}
                    {v.reviewedByName ? ` · reviewed by ${v.reviewedByName}` : ""}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{STATUS_LABEL[v.status] ?? v.status}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
