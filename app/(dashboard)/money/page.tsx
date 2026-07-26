import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { moneyLinks, navForRole } from "@/lib/navigation"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardContent } from "@/components/ui/card"
import { NavList } from "@/components/layout/nav-list"

/**
 * Productization wave 1 phase 4 — the primary nav's "Money" item. A
 * light grouping hub, not a merged feature: Payments and Expenses each
 * keep their own full page (lists, filters, exports) — this just gives
 * an owner one place to jump from. Reuses the same NavList the sidebar
 * itself renders, rather than a second link-list style.
 */
export default async function MoneyPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  return (
    <>
      <SectionHeader title="Money" description="Payments and running costs" />
      <Card>
        <CardContent>
          <NavList items={navForRole(moneyLinks, session.role)} />
        </CardContent>
      </Card>
    </>
  )
}
