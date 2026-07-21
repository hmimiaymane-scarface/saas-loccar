import { FileEdit, ClipboardCheck, Send, PenLine, CheckCircle2, Flag, Archive, Ban, type LucideIcon } from "lucide-react"

import { contractStatusLabel, type ContractStatus } from "@/lib/contracts/lifecycle"
import { cn } from "@/lib/utils"

const ICON: Record<ContractStatus, LucideIcon> = {
  draft: FileEdit,
  prepared: ClipboardCheck,
  awaiting_signature: Send,
  signed: PenLine,
  active: CheckCircle2,
  completed: Flag,
  archived: Archive,
  cancelled: Ban,
}

const BADGE_CLASS: Record<ContractStatus, string> = {
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  prepared: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
  awaiting_signature: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  signed: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  completed: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  archived: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
}

function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const Icon = ICON[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", BADGE_CLASS[status])}>
      <Icon className="size-3.5" />
      {contractStatusLabel(status)}
    </span>
  )
}

export { ContractStatusBadge }
