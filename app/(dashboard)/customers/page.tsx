import { redirect } from "next/navigation"
import Link from "next/link"
import { Users, UserPlus } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getCustomers, getCustomerCardContext } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { CustomerSearch } from "@/components/domain/customers/customer-search"
import { CustomerListItem } from "@/components/domain/customers/customer-list-item"
import { ExportButton } from "@/components/domain/export-button"
import { Button } from "@/components/ui/button"

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

  // Productization wave 2 phase 16 — scoped to just the displayed set,
  // not the whole company (getCustomers itself has no pagination yet —
  // a known, separate scalability gap, out of this phase's own scope).
  const cardContext = await getCustomerCardContext(session.company.id, filtered)

  return (
    <>
      <SectionHeader
        title="Customers"
        description={`${filtered.length} customer${filtered.length === 1 ? "" : "s"}`}
        actions={
          <div className="flex gap-2">
            <ExportButton resource="customers" />
            <Button size="sm" asChild>
              <Link href="/customers/new">
                <UserPlus />
                Add customer
              </Link>
            </Button>
          </div>
        }
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
            <CustomerListItem key={customer.id} customer={customer} context={cardContext[customer.id]} />
          ))}
        </div>
      )}
    </>
  )
}
