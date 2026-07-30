import Link from "next/link"
import {
  ClipboardList,
  CheckCircle2,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Wrench,
  RefreshCcw,
  UserPlus,
  UserRoundPlus,
  ClipboardCheck,
  ClipboardEdit,
  ShieldAlert,
  ShieldCheck,
  Banknote,
  Undo2,
  Lock,
  CalendarClock,
  Ban,
  Receipt,
  UserX,
  UserCheck2,
  UserMinus,
  RotateCcw,
  UserCog,
  CalendarPlus,
  FileSignature,
  FileCheck2,
  Send,
  Archive,
  Eye,
  Printer,
  Download,
  FilePlus,
  MessageCircle,
  Phone,
  type LucideIcon,
} from "lucide-react"

import type { ActivityItem, ActivityType } from "@/types/rental"
import { formatRelativeTime } from "@/lib/format"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const activityIcon: Record<ActivityType, LucideIcon> = {
  reservation_requested: ClipboardList,
  reservation_confirmed: CheckCircle2,
  reservation_status_changed: RefreshCcw,
  reservation_updated: ClipboardList,
  reservation_cancelled: Ban,
  payment_recorded: Wallet,
  payment_refunded: RotateCcw,
  vehicle_picked_up: ArrowUpRight,
  vehicle_returned: ArrowDownLeft,
  vehicle_status_changed: RefreshCcw,
  maintenance_completed: Wrench,
  customer_created: UserPlus,
  customer_updated: UserCog,
  document_uploaded: FileText,
  member_invited: UserRoundPlus,
  pickup_started: ClipboardEdit,
  return_started: ClipboardEdit,
  inspection_completed: ClipboardCheck,
  inspection_corrected: Lock,
  damage_recorded: ShieldAlert,
  damage_resolved: ShieldCheck,
  deposit_collected: Banknote,
  deposit_returned: Undo2,
  deposit_retained: Lock,
  maintenance_scheduled: CalendarClock,
  vehicle_entered_maintenance: Wrench,
  maintenance_cancelled: Ban,
  expense_recorded: Receipt,
  user_suspended: UserX,
  user_reactivated: UserCheck2,
  user_removed: UserMinus,
  invitation_accepted: UserRoundPlus,
  // Reserved types — no mutation emits these yet (see
  // supabase/migrations/20260723090000_event_backbone.sql), but the icon
  // map must stay exhaustive over ActivityType.
  rental_extended: CalendarPlus,
  contract_generated: FileSignature,
  contract_signed: FileCheck2,
  // Roadmap phase 11 — the contract lifecycle/template-management events.
  contract_prepared: ClipboardCheck,
  contract_sent_for_signature: Send,
  contract_activated: CheckCircle2,
  contract_completed: FileCheck2,
  contract_archived: Archive,
  contract_cancelled: Ban,
  contract_amended: ClipboardEdit,
  contract_viewed: Eye,
  contract_printed: Printer,
  contract_downloaded: Download,
  template_created: FilePlus,
  template_version_activated: FileCheck2,
  document_viewed: Eye,
  document_downloaded: Download,
  permission_override_granted: ShieldCheck,
  permission_override_revoked: ShieldAlert,
  // Roadmap phase 46 — customer communication log.
  whatsapp_confirmation_sent: MessageCircle,
  whatsapp_pickup_reminder_sent: MessageCircle,
  whatsapp_return_reminder_sent: MessageCircle,
  whatsapp_payment_reminder_sent: MessageCircle,
  whatsapp_contract_sent: MessageCircle,
  call_logged: Phone,
}

function ActivityFeedCard({ items }: { items: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Recent activity</CardTitle>
        <Link href="/activity" className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-5">
          {items.map((item) => {
            const Icon = activityIcon[item.type]
            return (
              <li key={item.id} className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm text-foreground">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(item.timestamp)}
                    {item.actor ? ` · ${item.actor}` : ""}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

export { ActivityFeedCard, activityIcon }
