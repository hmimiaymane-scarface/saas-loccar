import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

/**
 * Handles the redirect Supabase sends after a user confirms their email
 * (see `emailRedirectTo` in app/(auth)/actions.ts). Exchanges the one-time
 * code for a session, then hands off to `middleware.ts`, which will route
 * to `/onboarding` or `/overview` depending on whether a company exists.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next")
  const destination = next && next.startsWith("/") ? next : "/overview"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${destination}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`)
}
