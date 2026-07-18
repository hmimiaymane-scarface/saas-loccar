import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getVehicles } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { ExpenseForm } from "@/components/domain/expenses/expense-form"

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const canRecord =
    ["owner", "manager", "accountant"].includes(session.role) ||
    (session.role === "agent" && session.company.agentsCanRecordExpenses)
  if (!canRecord) redirect("/overview")

  const params = await searchParams
  const vehicles = await getVehicles(session.company.id)

  return (
    <>
      <SectionHeader title="Record expense" description="Fuel, maintenance, insurance and other running costs." />
      <ExpenseForm vehicles={vehicles} vehicleId={params.vehicle} />
    </>
  )
}
