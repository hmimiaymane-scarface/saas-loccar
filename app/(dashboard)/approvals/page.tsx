import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getApprovalRequests } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { ApprovalRow } from "@/components/domain/approvals/approval-row"

export default async function ApprovalsPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const requests = await getApprovalRequests(session.company.id)
  const canReview = session.role === "owner" || session.role === "manager"
  const pending = requests.filter((r) => r.status === "pending")
  const resolved = requests.filter((r) => r.status !== "pending")

  return (
    <>
      <SectionHeader
        title="Approvals"
        description={canReview ? "Requests from your team that need a decision." : "Requests you've made and their outcome."}
      />

      <div className="flex flex-col gap-3">
        {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending requests.</p>}
        {pending.map((request) => (
          <ApprovalRow key={request.id} request={request} canReview={canReview} />
        ))}
      </div>

      {resolved.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Resolved</h2>
          {resolved.map((request) => (
            <ApprovalRow key={request.id} request={request} canReview={false} />
          ))}
        </div>
      )}
    </>
  )
}
