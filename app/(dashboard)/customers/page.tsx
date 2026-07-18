import { redirect } from "next/navigation"
import { Users } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getCustomers } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { CustomerSearch } from "@/components/domain/customers/customer-search"
import { CustomerListItem } from "@/components/domain/customers/customer-list-item"
import { ExportButton } from "@/components/domain/export-button"

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const customers = await getCustomers(session.company.id)

  const query = params.search?.trim().toLowerCase()
  const filtered = query
    ? customers.filter((c) => c.fullName.toLowerCase().includes(query) || c.phone.includes(query))
    : customers

  return (
    <>
      <SectionHeader
        title="Customers"
        description={`${filtered.length} customer${filtered.length === 1 ? "" : "s"}`}
        actions={<ExportButton resource="customers" />}
      />

      <CustomerSearch />

      {filtered.length === 0 ? (
        <EmptyPlaceholder
          icon={Users}
          title="No customers match your search"
          description="Customers are added automatically the first time you create a reservation for them."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((customer) => (
            <CustomerListItem key={customer.id} customer={customer} />
          ))}
        </div>
      )}
    </>
  )
}
