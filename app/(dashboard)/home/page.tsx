import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/env"
import { getMobileMissionFeedInputs } from "@/lib/mobile/mission-feed-data"
import { buildMissionFeed } from "@/lib/mobile/mission-feed"
import { getFinancialReport, getWeeklyPickupCounts } from "@/lib/data"
import { resolveReportPeriod } from "@/lib/reports"
import { utcIsoToZonedLocal } from "@/lib/timezone"
import { computeRevenuePulseHeadline } from "@/lib/revenue-intelligence"
import { computeBusiestPickupDayHeadline, buildMobileBusinessPulseSummary } from "@/lib/mobile/business-pulse-summary"
import { SectionHeader } from "@/components/domain/section-header"
import { MissionFeedList } from "@/components/domain/mobile/mission-feed-list"

/**
 * Roadmap phase 16 requirement 2 — "Home screen as mission feed, not
 * dashboard." This is `mobilePrimaryNav`'s "Home" destination
 * (lib/navigation.ts) — desktop's own home stays /overview, unchanged;
 * this page is reachable from either shell by URL but only linked from
 * the mobile bottom nav, matching the bible's "different product, not
 * a smaller version of the same one" framing. Data gathering lives in
 * lib/mobile/mission-feed-data.ts; the actual "what matters right now"
 * decision is entirely in the pure lib/mobile/mission-feed.ts, same
 * pure-first/DB-second split every phase this session has used.
 *
 * Roadmap phase 33 ("Simplify Business Pulse") added the two-line
 * summary above the mission feed — "analytics answer questions instead
 * of creating homework," not a second dashboard. Deliberately capped at
 * 2 plain sentences via `buildMobileBusinessPulseSummary`; own try/catch
 * so a failure here degrades to zero lines, never breaking the mission
 * feed below it.
 */
export default async function HomePage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  let cards: ReturnType<typeof buildMissionFeed> = []
  try {
    const supabase = isSupabaseConfigured ? await createClient() : null
    const { reservations, feedItems, nowIso } = await getMobileMissionFeedInputs(
      supabase,
      session.company.id,
      session.userId,
      session.company.timezone
    )
    cards = buildMissionFeed({ reservations, feedItems, nowIso })
  } catch {
    cards = []
  }

  let summaryLines: string[] = []
  try {
    const tz = session.company.timezone
    const thisMonth = resolveReportPeriod("this_month", tz)
    const lastMonth = resolveReportPeriod("last_month", tz)
    const today = utcIsoToZonedLocal(resolveReportPeriod("today", tz).fromIso, tz).slice(0, 10)

    const [financialThisMonth, financialLastMonth, weeklyPickupCounts] = await Promise.all([
      getFinancialReport(session.company.id, thisMonth),
      getFinancialReport(session.company.id, lastMonth),
      getWeeklyPickupCounts(session.company.id, tz),
    ])

    const revenueHeadline = computeRevenuePulseHeadline(financialThisMonth.rentalPaymentsMad, financialLastMonth.rentalPaymentsMad)
    const busiestDayHeadline = computeBusiestPickupDayHeadline(weeklyPickupCounts, today, tz)
    summaryLines = buildMobileBusinessPulseSummary(revenueHeadline, busiestDayHeadline)
  } catch {
    summaryLines = []
  }

  const firstName = (session.profile.fullName ?? "there").split(" ")[0]

  return (
    <>
      <SectionHeader title={`Hi, ${firstName}`} description="Today's work, in order of what needs you first." />
      {summaryLines.length > 0 && (
        <div className="flex flex-col gap-1 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-foreground">
          {summaryLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
      <MissionFeedList cards={cards} />
    </>
  )
}
