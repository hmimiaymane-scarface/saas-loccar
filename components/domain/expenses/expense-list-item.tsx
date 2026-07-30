import { Car, Wrench } from "lucide-react"

import type { Expense } from "@/types/rental"
import { EXPENSE_CATEGORY_LABELS } from "@/lib/status"
import { formatDate, formatMad } from "@/lib/format"
import { ListItemCard } from "@/components/domain/list-item-card"

function ExpenseListItem({ expense }: { expense: Expense }) {
  return (
    <ListItemCard href={`/expenses/${expense.id}`} className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category}</p>
          {expense.maintenanceRecordId && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Wrench className="size-3" /> linked
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {expense.vehicleLabel && (
            <span className="flex items-center gap-1">
              <Car className="size-3" /> {expense.vehicleLabel}
            </span>
          )}
          {expense.supplier && <span>{expense.supplier}</span>}
          <span>{formatDate(expense.expenseDate)}</span>
        </div>
        {expense.description && <p className="truncate text-xs text-muted-foreground">{expense.description}</p>}
      </div>
      <span className="shrink-0 text-sm font-semibold text-foreground">{formatMad(expense.amountMad)}</span>
    </ListItemCard>
  )
}

export { ExpenseListItem }
