import Link from "next/link"
import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { searchContracts, type ContractSearchFilters } from "@/lib/contracts/template-store"
import { isSupabaseConfigured } from "@/lib/env"
import { formatDateTime } from "@/lib/format"
import { CONTRACT_STATUS_TRANSITIONS, type ContractStatus } from "@/lib/contracts/lifecycle"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { ContractStatusBadge } from "@/components/domain/contracts/contract-status-badge"
import { ContractSearchForm } from "@/components/domain/contracts/contract-search-form"
import { FileSignature } from "lucide-react"

const ALL_STATUSES = Object.keys(CONTRACT_STATUS_TRANSITIONS) as ContractStatus[]

/**
 * Roadmap phase 11 requirement 7 — "contracts searchable by customer,
 * vehicle, reservation, contract number, date, status, employee."
 * Reservation is reachable via the row's own link, not a separate
 * filter field (a contract has exactly one reservation — filtering
 * "by reservation" in practice means going to that reservation's own
 * page, which already lists its contract(s)).
 */
export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ customerName?: string; vehiclePlate?: string; contractNumber?: string; status?: string; dateFrom?: string; dateTo?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/overview")

  const params = await searchParams
  const filters: ContractSearchFilters = {
    customerName: params.customerName,
    vehiclePlate: params.vehiclePlate,
    contractNumber: params.contractNumber,
    status: ALL_STATUSES.includes(params.status as ContractStatus) ? (params.status as ContractStatus) : undefined,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  }

  let items: Awaited<ReturnType<typeof searchContracts>>["items"] = []
  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient()
      const result = await searchContracts(supabase, session.company.id, filters)
      items = result.items
    } catch {
      items = []
    }
  }

  return (
    <>
      <SectionHeader title="Contracts" description="Every generated contract, searchable by customer, vehicle, number, status, or date." />

      <ContractSearchForm initial={params} statuses={ALL_STATUSES} />

      {items.length === 0 ? (
        <EmptyPlaceholder icon={FileSignature} title="No contracts found" description="Try a different search, or generate one from a reservation." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((c) => (
            <Link key={c.id} href={`/contracts/${c.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">{c.contractNumber ?? c.id}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.customerName} · {c.vehicleLabel ?? "No vehicle"} · {c.reservationReference}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{formatDateTime(c.generatedAt)}</span>
                    <ContractStatusBadge status={c.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
