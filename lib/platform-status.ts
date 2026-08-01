import { CalendarClock, CheckCircle2, Ban, Archive } from "lucide-react"

import type { SubscriptionStatus } from "@/types/platform"
import type { StatusVisual } from "@/components/domain/status-badge"

// Roadmap phase 51 (UI Consistency Audit) — brought in line with every
// other status config in the app (lib/status.ts): full StatusVisual
// shape (was missing `icon`, so this could never be rendered through
// the shared StatusBadge component the way every other status is).
// `cancelled` also moves from an ad hoc `bg-muted`/`bg-muted-foreground`
// pairing onto the zinc family every other "closed/neutral" status uses
// (see contractStatusConfig.archived in lib/status.ts).
export const subscriptionStatusConfig: Record<SubscriptionStatus, StatusVisual> = {
  trial: {
    label: "Trial",
    icon: CalendarClock,
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  active: {
    label: "Active",
    icon: CheckCircle2,
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  suspended: {
    label: "Suspended",
    icon: Ban,
    badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    dot: "bg-red-500",
  },
  cancelled: {
    label: "Cancelled",
    icon: Archive,
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
    dot: "bg-zinc-400",
  },
}

export const PLATFORM_ACTION_LABELS: Record<string, string> = {
  trial_extended: "Trial started or extended",
  subscription_activated: "Subscription activated",
  company_suspended: "Company suspended",
  company_reactivated: "Company reactivated",
  subscription_cancelled: "Subscription cancelled",
  plan_label_changed: "Plan changed",
  subscription_dates_updated: "Subscription dates updated",
  internal_note_updated: "Internal note updated",
  migration_checklist_item_completed: "Migration checklist item completed",
  migration_checklist_item_reopened: "Migration checklist item reopened",
  product_signal_logged: "Product signal logged",
  product_signal_status_changed: "Product signal status changed",
}
