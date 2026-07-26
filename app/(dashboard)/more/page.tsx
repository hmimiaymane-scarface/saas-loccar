import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { moreLinks, navForRole } from "@/lib/navigation"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardContent } from "@/components/ui/card"
import { NavLinkList } from "@/components/domain/nav-link-list"

/**
 * Productization wave 1 phase 4 — the primary nav's "More" item and
 * catch-all for everything that isn't one of the 7 daily-action
 * primary areas. Also the only reachable path to any of these from the
 * mobile shell (see UserMenu's own "More" entry) — the bottom tab bar
 * only has 5 slots and none of this belongs on it.
 */
export default async function MorePage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  return (
    <>
      <SectionHeader title="More" description="Everything else you need, one tap away" />
      <Card>
        <CardContent>
          <NavLinkList items={navForRole(moreLinks, session.role)} />
        </CardContent>
      </Card>
    </>
  )
}
