import type { SubscriptionStatus } from "@/types/platform"

export const subscriptionStatusConfig: Record<SubscriptionStatus, { label: string; badge: string; dot: string }> = {
  trial: {
    label: "Trial",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  active: {
    label: "Active",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  suspended: {
    label: "Suspended",
    badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    dot: "bg-red-500",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
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
}
