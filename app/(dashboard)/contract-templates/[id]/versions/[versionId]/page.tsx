import { notFound, redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getTemplateVersion } from "@/lib/contracts/template-store"
import { SectionHeader } from "@/components/domain/section-header"
import { TemplateReviewEditor } from "@/components/domain/contracts/template-review-editor"
import { ActivateButton } from "@/components/domain/contracts/activate-button"

export default async function TemplateVersionReviewPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  const { id, versionId } = await params
  const supabase = await createClient()
  const version = await getTemplateVersion(supabase, session.company.id, versionId)
  if (!version || version.templateId !== id) notFound()

  return (
    <>
      <SectionHeader
        title={`Version ${version.versionNumber}`}
        description={
          version.status === "pending_review"
            ? "Review the AI-proposed mapping before it goes live."
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
