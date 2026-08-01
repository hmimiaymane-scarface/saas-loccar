import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { requirePlatformAdminPage } from "@/lib/auth/platform"
import { signOut } from "@/app/(auth)/actions"
import { Button } from "@/components/ui/button"

/** Deliberately its own small layout, not AppShell — no company switcher,
 * no tenant navigation, no notification bell. Visually distinct (dark
 * top bar) so nobody mistakes this for the rental-company dashboard.
 * requirePlatformAdminPage() is the real gate; middleware's check is
 * defense in depth on top of this. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePlatformAdminPage()

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b border-neutral-800 bg-neutral-950 text-neutral-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/platform" className="flex items-center gap-2 font-heading text-sm font-medium">
              <ShieldCheck className="size-4" />
              Platform Console
            </Link>
            <nav className="flex items-center gap-4 text-sm text-neutral-400">
              <Link href="/platform" className="hover:text-neutral-100">
                Overview
              </Link>
              <Link href="/platform/companies" className="hover:text-neutral-100">
                Companies
              </Link>
              <Link href="/platform/analytics" className="hover:text-neutral-100">
                Analytics
              </Link>
              <Link href="/platform/operations" className="hover:text-neutral-100">
                Operations
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-neutral-500 sm:inline">{session.email}</span>
            <form action={signOut}>
              <Button type="submit" size="sm" variant="outline" className="border-neutral-700 bg-transparent text-neutral-100 hover:bg-neutral-800 hover:text-neutral-100">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
