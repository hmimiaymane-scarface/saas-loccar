import { notFound, redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getTemplateVersion, type TemplateVersionRecord } from "@/lib/contracts/template-store"
import { isSupabaseConfigured } from "@/lib/env"
import { SectionHeader } from "@/components/domain/section-header"
import { TemplateReviewEditor } from "@/components/domain/contracts/template-review-editor"
import { ActivateButton } from "@/components/domain/contracts/activate-button"

async function loadVersion(companyId: string, versionId: string): Promise<TemplateVersionRecord | null> {
  if (!isSupabaseConfigured) return null
  try {
    const supabase = await createClient()
    return await getTemplateVersion(supabase, companyId, versionId)
  } catch {
    return null
  }
}

export default async function TemplateVersionReviewPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  const { id, versionId } = await params
  const version = await loadVersion(session.company.id, versionId)
  if (!version || version.templateId !== id) notFound()

  return (
    <>
      <SectionHeader
        title={`Version ${version.versionNumber}`}
        description={
          version.status === "pending_review"
            ? "Check the matched fields before this version goes live."
            : version.status === "active"
              ? "This version is currently active."
              : "This version was superseded — still viewable, still referenced by any contract generated from it."
        }
        actions={version.status === "pending_review" ? <ActivateButton templateId={id} versionId={versionId} /> : undefined}
      />

      <TemplateReviewEditor
        templateId={id}
        initialSections={version.sections}
        initialVariableMappings={version.variableMappings}
        initialLegalFooterText={version.legalFooterText}
        aiNotes={version.aiNotes}
        isActive={version.status !== "pending_review"}
      />
    </>
  )
}
