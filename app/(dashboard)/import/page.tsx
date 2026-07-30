import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { getSessionContext } from "@/lib/auth/session"
import { getImportBatches } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { RecentImports } from "@/components/domain/import/recent-imports"
import { ImportWizard } from "@/components/domain/import/import-wizard"

export const metadata: Metadata = { title: "Import data" }

/**
 * Roadmap phase 48 (Excel/CSV Importer). Owner/manager only — see
 * app/(dashboard)/import/actions.ts's own comment on why this is
 * gated tighter than either entity's single-record create role.
 */
export default async function ImportPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  const recentBatches = await getImportBatches(session.company.id)

  return (
    <>
      <SectionHeader
        title="Import data"
        description="Bring vehicles and customers in from a spreadsheet, with a safe preview before anything is saved."
      />
      <div className="flex flex-col gap-6">
        <RecentImports batches={recentBatches} />
        <ImportWizard />
      </div>
    </>
  )
}
