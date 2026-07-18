import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Car, ClipboardList, Wrench, User } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getExpenseDetail } from "@/lib/data"
import { formatDate, formatMad } from "@/lib/format"
import { EXPENSE_CATEGORY_LABELS } from "@/lib/status"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ExpenseEditForm } from "@/components/domain/expenses/expense-edit-form"
import { ExpenseReceiptUpload } from "@/components/domain/expenses/expense-receipt-upload"

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  // Matches the "Members can view expenses" RLS policy (every role can
  // read), not the narrower set that can create/edit one — an agent who
  // just recorded an expense (see /expenses/new) must land here
  // successfully, even though editing it afterward is reserved for
  // finance-adjacent roles below.
  if (!["owner", "manager", "agent", "accountant"].includes(session.role)) redirect("/overview")

  const { id } = await params
  const expense = await getExpenseDetail(session.company.id, id)
  if (!expense) notFound()

  const canEdit = ["owner", "manager", "accountant"].includes(session.role)
  const canDelete = session.role === "owner" || session.role === "manager"

  return (
    <>
      <SectionHeader
        title={EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category}
        description={formatDate(expense.expenseDate)}
        actions={<span className="text-lg font-semibold text-foreground">{formatMad(expense.amountMad)}</span>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                {expense.vehicleId && expense.vehicleLabel && (
                  <div className="flex items-center gap-2.5">
                    <Car className="size-4 text-muted-foreground" />
                    <Link href={`/fleet/${expense.vehicleId}`} className="text-foreground hover:underline">
                      {expense.vehicleLabel}
                    </Link>
                  </div>
                )}
                {expense.reservationId && (
                  <div className="flex items-center gap-2.5">
                    <ClipboardList className="size-4 text-muted-foreground" />
                    <Link href={`/reservations/${expense.reservationId}`} className="text-foreground hover:underline">
                      {expense.reservationReference}
                    </Link>
                  </div>
                )}
                {expense.maintenanceRecordId && (
                  <div className="flex items-center gap-2.5">
                    <Wrench className="size-4 text-muted-foreground" />
                    <Link href={`/maintenance/${expense.maintenanceRecordId}`} className="text-foreground hover:underline">
                      Linked maintenance record
                    </Link>
                  </div>
                )}
                <div className="text-muted-foreground">
                  Payment method <span className="text-foreground capitalize">{expense.method ?? "—"}</span>
                </div>
                {expense.supplier && (
                  <div className="text-muted-foreground">
                    Supplier <span className="text-foreground">{expense.supplier}</span>
                  </div>
                )}
              </div>
              {expense.description && (
                <>
                  <Separator />
                  <p className="text-sm whitespace-pre-wrap text-foreground">{expense.description}</p>
                </>
              )}
              {expense.notes && (
                <>
                  <Separator />
                  <p className="text-xs whitespace-pre-wrap text-muted-foreground">{expense.notes}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receipt</CardTitle>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <ExpenseReceiptUpload expenseId={expense.id} companyId={session.company.id} hasReceipt={Boolean(expense.receiptUrl)} />
              ) : expense.receiptUrl ? (
                <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                  View receipt
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">No receipt uploaded yet — ask a manager to add one.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Record</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <User className="size-3.5" /> Recorded by
                </span>
                <span>{expense.recordedByName ?? "Unknown"}</span>
              </div>
            </CardContent>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Manage</CardTitle>
              </CardHeader>
              <CardContent>
                <ExpenseEditForm expense={expense} canDelete={canDelete} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
