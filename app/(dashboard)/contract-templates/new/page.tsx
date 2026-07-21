import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardContent } from "@/components/ui/card"
import { TemplateUploadForm } from "@/components/domain/contracts/template-upload-form"

export default async function NewContractTemplatePage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  return (
    <>
      <SectionHeader title="Upload a contract template" description="PDF only for now — see docs/contracts.md." />
      <Card>
        <CardContent className="pt-6">
          <TemplateUploadForm companyId={session.company.id} />
        </CardContent>
      </Card>
    </>
  )
}
