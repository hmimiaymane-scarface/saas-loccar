import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"

/**
 * Roadmap phase 16 — the mobile mission-feed home screen lives here
 * (mobilePrimaryNav's "Home" tab, lib/navigation.ts). Placeholder for
 * this checkpoint (the mobile shell needs a real /home to link to
 * without a 404) — replaced with the actual mission feed in the next
 * checkpoint. Desktop's own home stays /overview, unchanged.
 */
export default async function HomePage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  redirect("/overview")
}
