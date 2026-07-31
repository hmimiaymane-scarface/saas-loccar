import { redirect } from "next/navigation"
import Link from "next/link"
import { Users, UserPlus } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getCustomersList, getCustomerCardContext } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { CustomerSearch } from "@/components/domain/customers/customer-search"
import { CustomerListItem } from "@/components/domain/customers/customer-list-item"
import { PaginationBar } from "@/components/domain/pagination-bar"
import { ExportButton } from "@/components/domain/export-button"
import { Button } from "@/components/ui/button"

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)

  // Roadmap phase 41 — this used to fetch every customer in the
  // company unconditionally (`getCustomers`, no `.range()`/limit at
  // all) and filter client-side in this function. The one genuinely
  // unpaginated list this phase's performance audit found; now matches
  // the fleet/reservations pages' own server-side `.range()` pattern.
  const result = await getCustomersList(session.company.id, { search: params.search }, page, 20)

  // Scoped to just this page's customers, not the whole company —
  // same convention `getFleetCardContext` on the fleet page already
  // established (Productization wave 2 phase 16).
  const cardContext = await getCustomerCardContext(session.company.id, result.items)

  return (
    <>
      <SectionHeader
        title="Customers"
        description={`${result.total} customer${result.total === 1 ? "" : "s"}`}
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

      {result.items.length === 0 ? (
        params.search ? (
          <EmptyPlaceholder
            icon={Users}
            title="No customers match your search"
            description="Customers are added automatically the first time you create a reservation for them."
          />
        ) : (
          <EmptyPlaceholder
            icon={Users}
            title="Start your first rental"
            description="Customers are added automatically the first time you create a reservation for them — there's no separate signup step."
            action={{ label: "New reservation", href: "/reservations/new" }}
          />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {result.items.map((customer) => (
            <CustomerListItem key={customer.id} customer={customer} context={cardContext[customer.id]} />
          ))}
        </div>
      )}

      <PaginationBar total={result.total} page={result.page} pageSize={result.pageSize} />
    </>
  )
}
