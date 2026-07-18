import { cn } from "@/lib/utils"
import { initials } from "@/lib/format"
import type { RentalCompany } from "@/types/rental"

const statusLabel: Record<RentalCompany["status"], string> = {
  trial: "Trial",
  active: "Active",
  suspended: "Suspended",
}

function CompanyIdentity({
  company,
  collapsed,
}: {
  company: RentalCompany
  collapsed?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-1",
        collapsed && "justify-center px-0"
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
        {initials(company.name)}
      </div>
      {!collapsed && (
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-sm font-semibold text-foreground">
            {company.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {company.city ? `${company.city} · ` : ""}
            {statusLabel[company.status]}
          </p>
        </div>
      )}
    </div>
  )
}

export { CompanyIdentity }
