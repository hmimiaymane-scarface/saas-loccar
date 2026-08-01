import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowRight } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getReservationDetail } from "@/lib/data"
import { formatMad } from "@/lib/format"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const RESPONSE_TONE: Record<string, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  damaged: "text-red-700 dark:text-red-400",
  missing: "text-amber-700 dark:text-amber-400",
  not_applicable: "text-muted-foreground",
}

export default async function ReservationComparisonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const { id } = await params
  const reservation = await getReservationDetail(session.company.id, id)
  if (!reservation) notFound()

  const { pickupInspection: pickup, returnInspection: ret } = reservation

  if (!pickup) {
    redirect(`/reservations/${id}`)
  }

  const distance = pickup.odometerKm != null && ret?.odometerKm != null ? ret.odometerKm - pickup.odometerKm : null

  const allKeys = Array.from(
    new Set([...(pickup.checklist ?? []).map((c) => c.itemKey), ...(ret?.checklist ?? []).map((c) => c.itemKey)])
  )

  const preExistingDamages = reservation.damages.filter((d) => d.preExisting)
  const newDamages = reservation.damages.filter((d) => !d.preExisting)

  return (
    <>
      <SectionHeader
        title="Pickup vs. return"
        description={`${reservation.reference} · ${reservation.customer.fullName}`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Odometer &amp; fuel</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Odometer</span>
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                {pickup.odometerKm?.toLocaleString() ?? "—"}
                <ArrowRight className="size-3.5 text-muted-foreground rtl:-scale-x-100" />
                {ret?.odometerKm?.toLocaleString() ?? "—"}
              </span>
            </div>
            {distance != null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Distance driven</span>
                <span className="font-medium text-foreground">{distance.toLocaleString()} km</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Fuel</span>
              <span className="flex items-center gap-1.5 font-medium text-foreground capitalize">
                {pickup.fuelLevel?.replace("_", " ") ?? "—"}
                <ArrowRight className="size-3.5 text-muted-foreground rtl:-scale-x-100" />
                {ret?.fuelLevel?.replace("_", " ") ?? "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial consequences</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total charged</span>
              <span className="font-medium text-foreground">{formatMad(reservation.payment.totalDueMad)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-foreground">{formatMad(reservation.payment.amountPaidMad)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deposit collected</span>
              <span className="text-foreground">{formatMad(reservation.deposit?.collectedMad ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deposit returned</span>
              <span className="text-foreground">{formatMad(reservation.deposit?.returnedMad ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deposit retained</span>
              <span className="text-foreground">{formatMad(reservation.deposit?.retainedMad ?? 0)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Checklist changes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {allKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No checklist data recorded.</p>
            ) : (
              allKeys.map((key) => {
                const p = pickup.checklist.find((c) => c.itemKey === key)
                const r = ret?.checklist.find((c) => c.itemKey === key)
                const changed = p && r && p.response !== r.response
                return (
                  <div key={key} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-foreground">{p?.itemLabel ?? r?.itemLabel}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={RESPONSE_TONE[p?.response ?? "good"]}>{p?.response ?? "—"}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground rtl:-scale-x-100" />
                      <span className={cn(RESPONSE_TONE[r?.response ?? "good"], changed && "font-semibold")}>
                        {r?.response ?? "—"}
                      </span>
                    </span>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pre-existing damage ({preExistingDamages.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {preExistingDamages.length === 0 ? (
              <p className="text-sm text-muted-foreground">None on file.</p>
            ) : (
              preExistingDamages.map((d) => (
                <Link key={d.id} href={`/damages/${d.id}`} className="flex justify-between py-2 text-sm hover:underline">
                  <span className="text-foreground">{d.vehicleArea}</span>
                  <span className="text-muted-foreground">{d.description}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Newly discovered damage ({newDamages.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {newDamages.length === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              newDamages.map((d) => (
                <Link key={d.id} href={`/damages/${d.id}`} className="flex justify-between py-2 text-sm hover:underline">
                  <span className="text-foreground">{d.vehicleArea}</span>
                  <span className="text-muted-foreground">{d.description}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ")
}
