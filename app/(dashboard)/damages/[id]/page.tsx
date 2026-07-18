import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Car, ClipboardList, Wallet } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getDamageDetail } from "@/lib/data"
import { formatDate, formatMad } from "@/lib/format"
import { damageStatusConfig } from "@/lib/status"
import { SectionHeader } from "@/components/domain/section-header"
import { StatusBadge } from "@/components/domain/status-badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { DamageResolutionForm } from "@/components/domain/damages/damage-resolution-form"
import { DamageEditForm } from "@/components/domain/damages/damage-edit-form"
import { DamageMediaSection } from "@/components/domain/damages/damage-media-section"

export default async function DamageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const { id } = await params
  const damage = await getDamageDetail(session.company.id, id)
  if (!damage) notFound()

  const canEdit = ["owner", "manager", "agent"].includes(session.role)
  const canResolve = session.role === "owner" || session.role === "manager"

  return (
    <>
      <SectionHeader
        title={damage.vehicleArea}
        description={`${damage.vehicleLabel} · Recorded ${formatDate(damage.createdAt)}`}
        actions={<StatusBadge visual={damageStatusConfig[damage.status]} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="flex items-center gap-2.5">
                  <Car className="size-4 text-muted-foreground" />
                  <Link href={`/fleet/${damage.vehicleId}`} className="text-foreground hover:underline">
                    {damage.vehicleLabel}
                  </Link>
                </div>
                {damage.reservationId && (
                  <div className="flex items-center gap-2.5">
                    <ClipboardList className="size-4 text-muted-foreground" />
                    <Link href={`/reservations/${damage.reservationId}`} className="text-foreground hover:underline">
                      {damage.reservationReference}
                    </Link>
                  </div>
                )}
                <div className="text-muted-foreground">
                  Category <span className="text-foreground capitalize">{damage.category}</span>
                </div>
                <div className="text-muted-foreground">
                  Severity <span className="text-foreground capitalize">{damage.severity}</span>
                </div>
                <div className="text-muted-foreground">
                  Timing{" "}
                  <span className="text-foreground">{damage.preExisting ? "Pre-existing" : "Newly discovered"}</span>
                </div>
              </div>
              <Separator />
              <p className="text-sm whitespace-pre-wrap text-foreground">{damage.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Photos</CardTitle>
            </CardHeader>
            <CardContent>
              <DamageMediaSection
                damageId={damage.id}
                companyId={session.company.id}
                initialMedia={damage.media}
                canUpload={canEdit}
              />
            </CardContent>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Edit</CardTitle>
              </CardHeader>
              <CardContent>
                <DamageEditForm damage={damage} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Wallet className="size-3.5" /> Estimated
                </span>
                <span className="text-foreground">
                  {damage.estimatedCostMad != null ? formatMad(damage.estimatedCostMad) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Actual</span>
                <span className="text-foreground">
                  {damage.actualCostMad != null ? formatMad(damage.actualCostMad) : "—"}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Recorded by</span>
                <span>{damage.createdByName ?? "Unknown"}</span>
              </div>
            </CardContent>
          </Card>

          {canResolve && <DamageResolutionForm damage={damage} />}
        </div>
      </div>
    </>
  )
}
