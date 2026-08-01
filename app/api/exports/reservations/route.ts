import type { NextRequest } from "next/server"

import { requireExportAccess, csvResponse } from "@/lib/exports"
import { getReservationsList } from "@/lib/data"
import { toCsv } from "@/lib/csv"
import { formatDate } from "@/lib/format"
import type { BookingStatus } from "@/types/rental"
import { withRouteObservability } from "@/lib/observability/route-wrapper"

async function handleGet(request: NextRequest) {
  const access = await requireExportAccess(["owner", "manager", "agent", "accountant"])
  if ("response" in access) return access.response
  const { session } = access

  const params = request.nextUrl.searchParams
  const statuses = params.get("status")?.split(",").filter(Boolean) as BookingStatus[] | undefined

  const result = await getReservationsList(
    session.company.id,
    {
      search: params.get("search") ?? undefined,
      statuses,
      branchId: params.get("branch") ?? undefined,
      dateFrom: params.get("from") ?? undefined,
      dateTo: params.get("to") ?? undefined,
    },
    1,
    5000
  )

  const csv = toCsv(result.items, [
    { header: "Reference", value: (r) => r.reference },
    { header: "Customer", value: (r) => r.customer.fullName },
    { header: "Phone", value: (r) => r.customer.phone },
    { header: "Vehicle", value: (r) => (r.vehicle ? `${r.vehicle.make} ${r.vehicle.model} (${r.vehicle.plate})` : "Unassigned") },
    { header: "Requested category", value: (r) => r.requestedCategory ?? "" },
    { header: "Pickup date", value: (r) => formatDate(r.startDate) },
    { header: "Return date", value: (r) => formatDate(r.endDate) },
    { header: "Pickup location", value: (r) => r.pickupLocation },
    { header: "Return location", value: (r) => r.returnLocation },
    { header: "Status", value: (r) => r.status },
    { header: "Overdue", value: (r) => (r.isOverdue ? "Yes" : "No") },
    { header: "Total due (MAD)", value: (r) => r.payment.totalDueMad },
    { header: "Amount paid (MAD)", value: (r) => r.payment.amountPaidMad },
    { header: "Remaining (MAD)", value: (r) => r.payment.remainingMad },
    { header: "Payment status", value: (r) => r.payment.status },
  ])

  return csvResponse(csv, "reservations.csv")
}

export const GET = withRouteObservability("exports/reservations", handleGet)
