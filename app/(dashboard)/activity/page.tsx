import { redirect } from "next/navigation"
import { History } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getActivityLogList, getTeamMembers } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { PaginationBar } from "@/components/domain/pagination-bar"
import { ActivityFilters } from "@/components/domain/activity/activity-filters"
import { ActivityLogRow } from "@/components/domain/activity/activity-log-row"
import type { ActivityType } from "@/types/rental"

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string; user?: string; page?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const companyId = session.company.id

  const [result, members] = await Promise.all([
    getActivityLogList(
      companyId,
      {
        type: params.type as ActivityType | undefined,
        dateFrom: params.from,
        dateTo: params.to,
        actorId: params.user,
      },
      page,
      30
    ),
    getTeamMembers(companyId),
  ])

  return (
    <>
      <SectionHeader title="Activity" description="Meaningful changes across your company" />

      <ActivityFilters members={members} />

      {result.items.length === 0 ? (
        <EmptyPlaceholder icon={History} title="No activity matches your filters" description="Actions like reservations, payments and maintenance updates will appear here." />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-3xl border border-border bg-card px-4">
          {result.items.map((item) => (
            <ActivityLogRow key={item.id} item={item} />
          ))}
        </div>
      )}

      <PaginationBar total={result.total} page={result.page} pageSize={result.pageSize} />
    </>
  )
}
