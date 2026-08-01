import type { NextRequest } from "next/server"

import { requireExportAccess, csvResponse } from "@/lib/exports"
import { getVehiclesList } from "@/lib/data"
import { toCsv } from "@/lib/csv"
import type { VehicleStatus, VehicleCategory } from "@/types/rental"
import { withRouteObservability } from "@/lib/observability/route-wrapper"

async function handleGet(request: NextRequest) {
  const access = await requireExportAccess(["owner", "manager", "agent"])
  if ("response" in access) return access.response
  const { session } = access

  const params = request.nextUrl.searchParams

  const result = await getVehiclesList(
    session.company.id,
    {
      search: params.get("search") ?? undefined,
      status: (params.get("status") as VehicleStatus | null) ?? undefined,
      category: (params.get("category") as VehicleCategory | null) ?? undefined,
      branchId: params.get("branch") ?? undefined,
    },
    1,
    5000
  )

  const csv = toCsv(result.items, [
    { header: "Make", value: (v) => v.make },
    { header: "Model", value: (v) => v.model },
    { header: "Year", value: (v) => v.year },
    { header: "Plate", value: (v) => v.plate },
    { header: "Category", value: (v) => v.category },
    { header: "Status", value: (v) => v.status },
    { header: "Daily rate (MAD)", value: (v) => v.dailyRateMad },
    { header: "Odometer (km)", value: (v) => v.mileageKm },
  ])

  return csvResponse(csv, "fleet.csv")
}

export const GET = withRouteObservability("exports/fleet", handleGet)
