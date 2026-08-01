import type { NextRequest } from "next/server"

import { requireExportAccess, csvResponse } from "@/lib/exports"
import { getMaintenanceList } from "@/lib/data"
import { toCsv } from "@/lib/csv"
import { formatDate } from "@/lib/format"
import { MAINTENANCE_TYPE_LABELS } from "@/lib/status"
import type { MaintenanceRecordStatus, MaintenancePriority } from "@/types/rental"
import { withRouteObservability } from "@/lib/observability/route-wrapper"

async function handleGet(request: NextRequest) {
  const access = await requireExportAccess(["owner", "manager"])
  if ("response" in access) return access.response
  const { session } = access

  const params = request.nextUrl.searchParams

  const result = await getMaintenanceList(
    session.company.id,
    {
      status: (params.get("status") as MaintenanceRecordStatus | null) ?? undefined,
      vehicleId: params.get("vehicle") ?? undefined,
      priority: (params.get("priority") as MaintenancePriority | null) ?? undefined,
    },
    1,
    5000
  )

  const csv = toCsv(result.items, [
    { header: "Vehicle", value: (m) => `${m.vehicleLabel} (${m.vehiclePlate})` },
    { header: "Category", value: (m) => MAINTENANCE_TYPE_LABELS[m.type] ?? m.type },
    { header: "Priority", value: (m) => m.priority },
    { header: "Status", value: (m) => m.status },
    { header: "Scheduled", value: (m) => (m.scheduledOn ? formatDate(m.scheduledOn) : "") },
    { header: "Started", value: (m) => (m.startedOn ? formatDate(m.startedOn) : "") },
    { header: "Completed", value: (m) => (m.completedOn ? formatDate(m.completedOn) : "") },
    { header: "Odometer (km)", value: (m) => m.odometerKm ?? "" },
    { header: "Estimated cost (MAD)", value: (m) => m.estimatedCostMad ?? "" },
    { header: "Actual cost (MAD)", value: (m) => m.actualCostMad ?? "" },
    { header: "Supplier", value: (m) => m.supplier ?? "" },
    { header: "Next service", value: (m) => (m.nextServiceOn ? formatDate(m.nextServiceOn) : "") },
    { header: "Recorded by", value: (m) => m.createdByName ?? "" },
  ])

  return csvResponse(csv, "maintenance.csv")
}

export const GET = withRouteObservability("exports/maintenance", handleGet)
