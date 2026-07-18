import { redirect } from "next/navigation"
import { FileText } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getDocumentsList, getCustomers, getVehicles } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { PaginationBar } from "@/components/domain/pagination-bar"
import { DocumentFilters } from "@/components/domain/documents/document-filters"
import { DocumentListItem } from "@/components/domain/documents/document-list-item"
import { NewDocumentForm } from "@/components/domain/documents/new-document-form"
import type { DocumentCategory } from "@/types/rental"

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string; page?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const companyId = session.company.id

  const [result, customers, vehicles] = await Promise.all([
    getDocumentsList(
      companyId,
      { category: params.category as DocumentCategory | undefined, search: params.search },
      page,
      20
    ),
    getCustomers(companyId),
    getVehicles(companyId),
  ])

  const canDelete = session.role === "owner" || session.role === "manager"

  return (
    <>
      <SectionHeader
        title="Documents"
        description={`${result.total} document${result.total === 1 ? "" : "s"} on file`}
      />

      <NewDocumentForm companyId={companyId} customers={customers} vehicles={vehicles} />

      <DocumentFilters />

      {result.items.length === 0 ? (
        <EmptyPlaceholder
          icon={FileText}
          title="No documents match your filters"
          description="Contracts, IDs and licences uploaded during pickup, or from the form above, appear here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {result.items.map((doc) => (
            <DocumentListItem key={doc.id} document={doc} canDelete={canDelete} />
          ))}
        </div>
      )}

      <PaginationBar total={result.total} page={result.page} pageSize={result.pageSize} />
    </>
  )
}
