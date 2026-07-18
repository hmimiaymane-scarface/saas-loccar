import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { isSupabaseConfigured, env } from "@/lib/env"

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/auth/callback"]
const ONBOARDING_PATH = "/onboarding"

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

/**
 * Refreshes the Supabase session on every request and enforces the two
 * server-side gates the rest of the app relies on:
 *
 *  1. Unauthenticated users can only reach `/sign-in`, `/sign-up`, `/auth/*`.
 *  2. Authenticated users with no company membership are held on
 *     `/onboarding` until they create one.
 *
 * This is a usability convenience, not the security boundary — RLS on the
 * database is what actually enforces company isolation. Even if this
 * middleware were bypassed, no data would leak.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  if (!isSupabaseConfigured) {
    // Local/demo mode without Supabase credentials: skip auth gating so the
    // mock-data app shell remains reachable. See lib/data.ts for the mock
    // fallback and .env.example for what's required to turn this on.
    return supabaseResponse
  }

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user) {
    if (isPublicPath(pathname)) return supabaseResponse
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/sign-in"
    redirectUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Authenticated from here on.
  if (isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/overview"
    redirectUrl.search = ""
    return NextResponse.redirect(redirectUrl)
  }

  const { count } = await supabase
    .from("company_memberships")
    .select("id", { count: "exact", head: true })

  const hasCompany = Boolean(count && count > 0)

  if (!hasCompany && pathname !== ONBOARDING_PATH) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = ONBOARDING_PATH
    redirectUrl.search = ""
    return NextResponse.redirect(redirectUrl)
  }

  if (hasCompany && pathname === ONBOARDING_PATH) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/overview"
    redirectUrl.search = ""
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}
