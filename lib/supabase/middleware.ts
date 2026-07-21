import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { isSupabaseConfigured, env } from "@/lib/env"

// /offline (roadmap phase 16) is public so the service worker's install
// step can always cache a 200 response for it regardless of auth state,
// and so it never loops through a redirect if reached directly.
const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/auth/callback", "/offline"]
const ONBOARDING_PATH = "/onboarding"
const ACCOUNT_SUSPENDED_PATH = "/account-suspended"
const PLATFORM_PATH = "/platform"
// Reachable by an authenticated user even before they have any company
// membership — an invite link is exactly how someone gets their first
// membership without going through onboarding's "create a company" flow.
// Platform routes are here too: a platform admin may have no tenant
// company membership at all, and must never be funneled into onboarding.
const ALLOWED_WITHOUT_COMPANY = [ONBOARDING_PATH, "/invite", PLATFORM_PATH]

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

function isAllowedWithoutCompany(pathname: string) {
  return ALLOWED_WITHOUT_COMPANY.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

function isPlatformPath(pathname: string) {
  return pathname === PLATFORM_PATH || pathname.startsWith(`${PLATFORM_PATH}/`)
}

/**
 * Refreshes the Supabase session on every request and enforces the
 * server-side gates the rest of the app relies on:
 *
 *  1. Unauthenticated users can only reach `/sign-in`, `/sign-up`, `/auth/*`.
 *  2. Authenticated users with no company membership are held on
 *     `/onboarding` until they create one (platform routes exempt).
 *  3. A suspended company's users are held on `/account-suspended`.
 *  4. `/platform/*` requires real platform-admin status, checked here as
 *     defense in depth — the actual enforcement is is_platform_admin()
 *     and the RLS/SECURITY DEFINER functions in
 *     supabase/migrations/2026072109*.sql, not this redirect.
 *
 * This is a usability convenience, not the security boundary — RLS on the
 * database is what actually enforces company isolation and platform-admin
 * access. Even if this middleware were bypassed, no data would leak.
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

  if (isPlatformPath(pathname)) {
    const { data: isAdmin } = await supabase.rpc("is_platform_admin")
    if (!isAdmin) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = "/overview"
      redirectUrl.search = ""
      return NextResponse.redirect(redirectUrl)
    }
    return supabaseResponse
  }

  // A suspended membership row still exists, so it must be excluded here
  // too (mirrors the same fix in lib/auth/session.ts) — otherwise a
  // suspended user would keep sailing past this gate into a dashboard
  // where every real query then fails RLS anyway, instead of landing
  // somewhere that explains what happened.
  const { data: memberships } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("status", "active")
    .limit(1)

  const activeCompanyId = memberships?.[0]?.company_id as string | undefined
  const hasCompany = Boolean(activeCompanyId)

  if (!hasCompany && !isAllowedWithoutCompany(pathname)) {
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

  // Platform-suspended companies (set manually by the SaaS owner, see
  // company_subscriptions) are held on a clear status page instead of the
  // normal dashboard — their data is untouched, this is purely an access
  // gate that a platform-admin reactivation immediately lifts.
  if (hasCompany && pathname !== ACCOUNT_SUSPENDED_PATH) {
    const { data: suspended } = await supabase.rpc("is_company_suspended", {
      target_company_id: activeCompanyId,
    })
    if (suspended) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = ACCOUNT_SUSPENDED_PATH
      redirectUrl.search = ""
      return NextResponse.redirect(redirectUrl)
    }
  }

  if (!hasCompany && pathname === ACCOUNT_SUSPENDED_PATH) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = ONBOARDING_PATH
    redirectUrl.search = ""
    return NextResponse.redirect(redirectUrl)
  }

  if (hasCompany && pathname === ACCOUNT_SUSPENDED_PATH) {
    const { data: suspended } = await supabase.rpc("is_company_suspended", {
      target_company_id: activeCompanyId,
    })
    if (!suspended) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = "/overview"
      redirectUrl.search = ""
      return NextResponse.redirect(redirectUrl)
    }
  }

  return supabaseResponse
}
