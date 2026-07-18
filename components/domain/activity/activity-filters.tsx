"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"

import type { ActivityType, TeamMember } from "@/types/rental"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"

const TYPE_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: "reservation_requested", label: "Reservation requested" },
  { value: "reservation_confirmed", label: "Reservation confirmed" },
  { value: "reservation_status_changed", label: "Reservation status changed" },
  { value: "payment_recorded", label: "Payment recorded" },
  { value: "vehicle_picked_up", label: "Pickup completed" },
  { value: "vehicle_returned", label: "Return completed" },
  { value: "vehicle_status_changed", label: "Vehicle status changed" },
  { value: "maintenance_scheduled", label: "Maintenance scheduled" },
  { value: "vehicle_entered_maintenance", label: "Vehicle entered maintenance" },
  { value: "maintenance_completed", label: "Maintenance completed" },
  { value: "maintenance_cancelled", label: "Maintenance cancelled" },
  { value: "expense_recorded", label: "Expense recorded" },
  { value: "damage_recorded", label: "Damage recorded" },
  { value: "damage_resolved", label: "Damage updated" },
  { value: "deposit_collected", label: "Deposit collected" },
  { value: "deposit_returned", label: "Deposit returned" },
  { value: "deposit_retained", label: "Deposit retained" },
  { value: "member_invited", label: "Team member invited" },
  { value: "user_suspended", label: "Team member suspended" },
  { value: "user_removed", label: "Team member removed" },
]

function ActivityFilters({ members }: { members: TeamMember[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <NativeSelect
        className="sm:w-56"
        defaultValue={searchParams.get("type") ?? ""}
        onChange={(e) => updateParams((params) => (e.target.value ? params.set("type", e.target.value) : params.delete("type")))}
      >
        <option value="">All action types</option>
        {TYPE_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </NativeSelect>

      {members.length > 1 && (
        <NativeSelect
          className="sm:w-48"
          defaultValue={searchParams.get("user") ?? ""}
          onChange={(e) => updateParams((params) => (e.target.value ? params.set("user", e.target.value) : params.delete("user")))}
        >
          <option value="">Everyone</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.fullName ?? m.email ?? "Unknown"}
            </option>
          ))}
        </NativeSelect>
      )}

      <Input
        type="date"
        className="sm:w-40"
        defaultValue={searchParams.get("from") ?? ""}
        onChange={(e) => updateParams((params) => (e.target.value ? params.set("from", e.target.value) : params.delete("from")))}
      />
      <Input
        type="date"
        className="sm:w-40"
        defaultValue={searchParams.get("to") ?? ""}
        onChange={(e) => updateParams((params) => (e.target.value ? params.set("to", e.target.value) : params.delete("to")))}
      />
    </div>
  )
}

export { ActivityFilters }
