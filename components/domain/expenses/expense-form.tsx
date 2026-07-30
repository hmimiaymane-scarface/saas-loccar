"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { createExpense, type ExpenseActionState } from "@/app/(dashboard)/expenses/actions"
import { EXPENSE_CATEGORY_LABELS } from "@/lib/status"
import type { Vehicle } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const initialState: ExpenseActionState = {}

function ExpenseForm({ vehicles, vehicleId }: { vehicles: Vehicle[]; vehicleId?: string }) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(async (prev: ExpenseActionState, formData: FormData) => {
    const result = await createExpense(prev, formData)
    if (result.expenseId) router.push(`/expenses/${result.expenseId}`)
    return result
  }, initialState)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Expense details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <NativeSelect id="category" name="category" defaultValue="other" required>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount (MAD)</Label>
            <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expenseDate">Date</Label>
            <Input id="expenseDate" name="expenseDate" type="date" defaultValue={today} required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="method">Payment method</Label>
            <NativeSelect id="method" name="method" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="transfer">Transfer</option>
              <option value="other">Other</option>
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="vehicleId">Vehicle (optional)</Label>
            <NativeSelect id="vehicleId" name="vehicleId" defaultValue={vehicleId ?? ""}>
              <option value="">Not vehicle-specific</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} · {v.plate}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="supplier">Supplier</Label>
            <Input id="supplier" name="supplier" />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
        </CardContent>
      </Card>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save expense
        </Button>
      </div>
    </form>
  )
}

export { ExpenseForm }
