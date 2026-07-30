import Link from "next/link"
import Image from "next/image"
import { notFound, redirect } from "next/navigation"
import { Gauge, Fuel, Sparkles, User } from "lucide-react"

import { getSessionContext } from "@/lib/auth/session"
import { getInspectionDetail, getDamagesList } from "@/lib/data"
import { formatInTimeZone } from "@/lib/timezone"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { InspectionCorrectionForm } from "@/components/domain/inspections/inspection-correction-form"

const RESPONSE_LABEL: Record<string, string> = {
  good: "Good",
  damaged: "Damaged",
  missing: "Missing",
  not_applicable: "N/A",
}

const RESPONSE_TONE: Record<string, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  damaged: "text-red-700 dark:text-red-400",
  missing: "text-amber-700 dark:text-amber-400",
  not_applicable: "text-muted-foreground",
}

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const { id } = await params
  const inspection = await getInspectionDetail(session.company.id, id)
  if (!inspection) notFound()

  const vehicleDamages = await getDamagesList(session.company.id, { vehicleId: inspection.vehicleId })
  const discoveredDamages = vehicleDamages.filter((d) => d.discoveredInInspectionId === inspection.id)

  const tz = session.company.timezone
  const canCorrect = (session.role === "owner" || session.role === "manager") && inspection.status === "completed"

  return (
    <>
      <SectionHeader
        title={`${inspection.type === "pickup" ? "Pickup" : "Return"} inspection`}
        actions={
          <div className="flex items-center gap-3">
            <Link href={`/reservations/${inspection.reservationId}`} className="text-sm text-muted-foreground hover:underline">
              View reservation
            </Link>
            <Badge variant={inspection.status === "completed" ? "default" : "outline"}>
              {inspection.status === "completed" ? "Completed" : "Draft"}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Condition at {inspection.type}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-2.5">
                <Gauge className="size-4 text-muted-foreground" />
                <span className="text-sm text-foreground">
                  {inspection.odometerKm != null ? `${inspection.odometerKm.toLocaleString()} km` : "Not recorded"}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Fuel className="size-4 text-muted-foreground" />
                <span className="text-sm text-foreground capitalize">
                  {inspection.fuelLevel ? inspection.fuelLevel.replace("_", " ") : "Not recorded"}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Sparkles className="size-4 text-muted-foreground" />
                <span className="text-sm text-foreground capitalize">
                  {inspection.cleanliness ?? "Not recorded"} · {inspection.overallCondition ?? "Not recorded"}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <User className="size-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{inspection.performedByName ?? "Unknown"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Checklist</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {inspection.checklist.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checklist responses recorded.</p>
              ) : (
                inspection.checklist.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-foreground">{item.itemLabel}</span>
                    <span className={RESPONSE_TONE[item.response]}>{RESPONSE_LABEL[item.response]}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {inspection.media.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Photos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {inspection.media.map((m) => (
                    <a
                      key={m.id}
                      href={m.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-muted"
                    >
                      {m.url ? (
                        <Image
                          src={m.url}
                          alt={m.caption ?? m.originalFilename}
                          fill
                          sizes="(min-width: 640px) 25vw, 50vw"
                          className="object-cover"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">No preview</span>
                      )}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {discoveredDamages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Damage discovered here</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border">
                {discoveredDamages.map((d) => (
                  <Link
                    key={d.id}
                    href={`/damages/${d.id}`}
                    className="flex items-center justify-between py-2 text-sm hover:underline"
                  >
                    <span className="text-foreground">{d.vehicleArea}</span>
                    <span className="text-muted-foreground">{d.description}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {inspection.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-foreground">{inspection.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Record</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span className="text-foreground">
                  {inspection.completedAt
                    ? formatInTimeZone(inspection.completedAt, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "Not yet"}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Started</span>
                <span className="text-foreground">
                  {formatInTimeZone(inspection.createdAt, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {inspection.correctionReason && (
                <>
                  <Separator />
                  <div className="rounded-2xl bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    <p className="font-medium">Corrected</p>
                    <p>{inspection.correctionReason}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {canCorrect && <InspectionCorrectionForm inspection={inspection} />}
        </div>
      </div>
    </>
  )
}
