import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getBranches } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { CompanySettingsForm } from "@/components/domain/settings/company-settings-form"
import { BranchesSection } from "@/components/domain/settings/branches-section"

export default async function SettingsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  const branches = await getBranches(session.company.id)

  return (
    <>
      <SectionHeader title="Settings" description="Company preferences and locations" />
      <CompanySettingsForm company={session.company} />
      <BranchesSection branches={branches} />
    </>
  )
}
