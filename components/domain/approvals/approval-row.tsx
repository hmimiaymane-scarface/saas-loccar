"use client"

import { useRouter } from "next/navigation"
import { CheckCircle2, XCircle, Clock } from "lucide-react"

import { resolveApprovalRequest } from "@/app/(dashboard)/approvals/actions"
import type { ApprovalRequest, ApprovalRequestType } from "@/types/rental"
import { formatDateTime } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SensitiveActionConfirmDialog } from "@/components/domain/shared/sensitive-action-confirm-dialog"

const TYPE_LABELS: Record<ApprovalRequestType, string> = {
  large_discount: "Large discount",
  refund: "Refund",
  contract_amendment: "Contract amendment",
  vehicle_exchange: "Vehicle exchange",
  blacklist_customer: "Blacklist customer",
}

function ApprovalRow({ request, canReview }: { request: ApprovalRequest; canReview: boolean }) {
  const router = useRouter()

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{TYPE_LABELS[request.type]}</span>
            <span className="text-xs text-muted-foreground">
              {request.requestedByName ?? "Someone"} · {formatDateTime(request.createdAt)}
            </span>
          </div>
          <StatusBadge status={request.status} />
        </div>
        <p className="text-sm text-muted-foreground">{request.reason}</p>
        {request.status !== "pending" && request.reviewedByName && (
          <p className="text-xs text-muted-foreground">
            {request.status === "approved" ? "Approved" : "Rejected"} by {request.reviewedByName}
            {request.reviewedAt ? ` · ${formatDateTime(request.reviewedAt)}` : ""}
          </p>
        )}
        {canReview && request.status === "pending" && (
          <div className="mt-1 flex justify-end gap-2">
            <SensitiveActionConfirmDialog
              trigger={
                <Button type="button" variant="outline" size="sm">
                  <XCircle />
                  Reject
                </Button>
              }
              title="Reject this request?"
              description="The requester will be notified with your reason."
              confirmLabel="Reject"
              reasonPlaceholder="Reason for rejecting…"
              onConfirm={(reason) => resolveApprovalRequest(request.id, "rejected", reason)}
              onSuccess={() => router.refresh()}
            />
            <SensitiveActionConfirmDialog
              trigger={
                <Button type="button" size="sm">
                  <CheckCircle2 />
                  Approve
                </Button>
              }
              title="Approve this request?"
              description="This applies the change immediately and notifies the requester."
              confirmLabel="Approve"
              reasonPlaceholder="Reason for approving…"
              onConfirm={(reason) => resolveApprovalRequest(request.id, "approved", reason)}
              onSuccess={() => router.refresh()}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: ApprovalRequest["status"] }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
        <CheckCircle2 className="size-3" />
        Approved
      </span>
    )
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
        <XCircle className="size-3" />
        Rejected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
      <Clock className="size-3" />
      Pending
    </span>
  )
}

export { ApprovalRow }
