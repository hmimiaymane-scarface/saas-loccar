import type { NextRequest } from "next/server"

import { requireExportAccess, csvResponse } from "@/lib/exports"
import { getCustomers } from "@/lib/data"
import { toCsv } from "@/lib/csv"
import { formatDate } from "@/lib/format"
import { withRouteObservability } from "@/lib/observability/route-wrapper"

async function handleGet(request: NextRequest) {
  const access = await requireExportAccess(["owner", "manager", "agent"])
  if ("response" in access) return access.response
  const { session } = access

  const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase()
  let customers = await getCustomers(session.company.id)
  if (search) {
    customers = customers.filter((c) => c.fullName.toLowerCase().includes(search) || c.phone.includes(search))
  }

  const csv = toCsv(customers, [
    { header: "Full name", value: (c) => c.fullName },
    { header: "Phone", value: (c) => c.phone },
    { header: "Email", value: (c) => c.email ?? "" },
    { header: "Licence number", value: (c) => c.licenseNumber },
    { header: "Licence expires", value: (c) => (c.licenseExpiresAt ? formatDate(c.licenseExpiresAt) : "") },
    { header: "Total bookings", value: (c) => c.totalBookings },
  ])

  return csvResponse(csv, "customers.csv")
}

export const GET = withRouteObservability("exports/customers", handleGet)
