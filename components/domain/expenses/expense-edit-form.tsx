"use client"

import { useActionState, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Trash2 } from "lucide-react"

import { updateExpense, deleteExpense, type ExpenseActionState } from "@/app/(dashboard)/expenses/actions"
import { EXPENSE_CATEGORY_LABELS } from "@/lib/status"
import type { Expense } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"

const initialState: ExpenseActionState = {}

function ExpenseEditForm({ expense, canDelete }: { expense: Expense; canDelete: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const action = updateExpense.bind(null, expense.id)
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [isDeleting, startDeleteTransition] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (!open) {
    return (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil />
          Edit
        </Button>
        {canDelete && (
          <Button
            variant="destructive"
            size="sm"
            disabled={isDeleting}
            onClick={() =>
              startDeleteTransition(async () => {
                const result = await deleteExpense(expense.id)
                if (result.error) setDeleteError(result.error)
                else router.push("/expenses")
              })
            }
          >
            {isDeleting && <Loader2 className="animate-spin" />}
            <Trash2 />
            Delete
          </Button>
        )}
        {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <NativeSelect id="category" name="category" defaultValue={expense.category} required>
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Amount (MAD)</Label>
          <Input id="amount" name="amount" type="number" step="0.01" min="0.01" defaultValue={expense.amountMad} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expenseDate">Date</Label>
          <Input id="expenseDate" name="expenseDate" type="date" defaultValue={expense.expenseDate} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="method">Payment method</Label>
          <NativeSelect id="method" name="method" defaultValue={expense.method ?? "cash"}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="transfer">Transfer</option>
            <option value="other">Other</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="supplier">Supplier</Label>
          <Input id="supplier" name="supplier" defaultValue={expense.supplier ?? undefined} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} defaultValue={expense.description ?? undefined} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={expense.notes ?? undefined} />
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  )
}

export { ExpenseEditForm }
