import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { SectionHeader } from "@/components/domain/section-header"
import { CustomerForm } from "@/components/domain/customers/customer-form"

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager", "agent"].includes(session.role)) redirect("/customers")

  const params = await searchParams
  // Only ever hop back to a page within this app, never an arbitrary URL.
  const returnTo = params.returnTo && params.returnTo.startsWith("/") ? params.returnTo : undefined

  return (
    <>
      <SectionHeader title="Add customer" description="Full profile — for a quick add during booking, use the reservation form instead." />
      <CustomerForm returnTo={returnTo} />
    </>
  )
}
