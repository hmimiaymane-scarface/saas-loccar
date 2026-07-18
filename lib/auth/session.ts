import { cache } from "react"

import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { currentCompany, currentEmployee } from "@/lib/mock/company"
import type { RentalCompany, Employee, EmployeeRole } from "@/types/rental"

export interface SessionContext {
  userId: string
  email: string | null
  profile: {
    fullName: string | null
    avatarPath: string | null
    phone: string | null
    preferredLanguage: string
  }
  company: RentalCompany
  role: EmployeeRole
}

/**
 * The single place that answers "who is signed in, which company are they
 * acting as, and with what role". `app/(dashboard)/layout.tsx` calls this
 * once; anything deeper in the tree that needs identity or company data
 * should get it from there as a prop rather than calling this again.
 *
 * Wrapped in React's `cache()` so multiple calls within the same request
 * (e.g. a page and its layout both needing it) hit Supabase once.
 *
 * Returns `null` when there is no authenticated user with a company yet —
 * middleware.ts is what actually redirects in that case, this function
 * just reports the fact.
 *
 * Mock mode (no Supabase credentials configured): returns the fixed
 * Atlas Rent Car / Youssef El Amrani identity so the shell keeps working
 * without a database. See lib/data.ts for the equivalent on business data.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  if (!isSupabaseConfigured) {
    return {
      userId: "mock-user",
      email: currentEmployee.email,
      profile: {
        fullName: currentEmployee.fullName,
        avatarPath: null,
        phone: null,
        preferredLanguage: "fr",
      },
      company: currentCompany,
      role: currentEmployee.role,
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("company_memberships")
      .select("role, company_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ])

  if (!membership) return null

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", membership.company_id)
    .maybeSingle()

  if (!company) return null

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: {
      fullName: profile?.full_name ?? null,
      avatarPath: profile?.avatar_path ?? null,
      phone: profile?.phone ?? null,
      preferredLanguage: profile?.preferred_language ?? "fr",
    },
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      city: company.city,
      country: company.country,
      currency: company.currency,
      timezone: company.timezone,
      status: company.status as RentalCompany["status"],
    },
    role: membership.role as EmployeeRole,
  }
})

/** Convenience wrapper for header/sidebar code that only needs the
 * `Employee`-shaped view of the current user (used to render the user
 * menu without every call site re-deriving fullName/role/email). */
export function toEmployee(session: SessionContext): Employee {
  return {
    id: session.userId,
    fullName: session.profile.fullName ?? session.email ?? "Team member",
    role: session.role,
    email: session.email ?? "",
  }
}
