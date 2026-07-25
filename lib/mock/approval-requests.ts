import type { ApprovalRequest } from "@/types/rental"

export const mockApprovalRequests: ApprovalRequest[] = [
  {
    id: "appr_1",
    type: "large_discount",
    entityType: "reservation",
    entityId: "res_1",
    requestedById: "emp_2",
    requestedByName: "Sara Benkirane",
    payload: { reservation_id: "res_1", discount_amount: 400 },
    status: "pending",
    reason: "Repeat customer, requested a loyalty discount for a 10-day rental.",
    reviewedById: null,
    reviewedByName: null,
    reviewedAt: null,
    createdAt: "2026-07-24T10:00:00Z",
  },
]
