import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/env"
import { getMobileMissionFeedInputs } from "@/lib/mobile/mission-feed-data"
import { buildMissionFeed } from "@/lib/mobile/mission-feed"
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

  const firstName = (session.profile.fullName ?? "there").split(" ")[0]

  return (
    <>
      <SectionHeader title={`Hi, ${firstName}`} description="Today's work, in order of what needs you first." />
      <MissionFeedList cards={cards} />
    </>
  )
}
