"use client"

import { useState, useTransition } from "react"
import { UserX, UserCheck, Trash2, Loader2, ChevronDown } from "lucide-react"

import {
  updateMemberRoleAction,
  suspendMemberAction,
  reactivateMemberAction,
  removeMemberAction,
  setStaffAccessAction,
} from "@/app/(dashboard)/employees/actions"
import { canChangeRole, canSuspend, canRemove } from "@/lib/team-rules"
import { ROLE_LABELS } from "@/lib/roles"
import { STAFF_ACCESS_SWITCHES, isSwitchOn } from "@/lib/permissions/service"
import { formatDate, initials } from "@/lib/format"
import { vibrate } from "@/lib/haptics"
import type { EmployeeRole, TeamMember } from "@/types/rental"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { ListItemCard } from "@/components/domain/list-item-card"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

// Productization wave 1 phase 2 — only Owner and Staff (the existing
// "manager" role) are offered going forward; see invite-form.tsx's own
// note. A member's own CURRENT role is always included too, even if
// it's one of the 5 retired ones, so a legacy row never renders a
// <select> with no matching option — they can still be moved to
// Owner/Staff from here.
const ROLE_OPTIONS: EmployeeRole[] = ["owner", "manager"]

function MemberRow({
  member,
  isSelf,
  actorRole,
  isLastActiveOwner,
}: {
  member: TeamMember
  isSelf: boolean
  actorRole: EmployeeRole
  isLastActiveOwner: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [confirmingSuspend, setConfirmingSuspend] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [, startAccessTransition] = useTransition()

  function toggleSwitch(switchId: string, allowed: boolean) {
    vibrate("light")
    setAccessError(null)
    setPendingSwitchId(switchId)
    startAccessTransition(async () => {
      const result = await setStaffAccessAction(member.userId, member.role, switchId, allowed)
      if (result.error) setAccessError(result.error)
      setPendingSwitchId(null)
    })
  }

  function changeRole(role: EmployeeRole) {
    setError(null)
    startTransition(async () => {
      const result = await updateMemberRoleAction(member.membershipId, role)
      if (result.error) setError(result.error)
    })
  }

  function toggleSuspend() {
    setError(null)
    startTransition(async () => {
      const result =
        member.status === "active"
          ? await suspendMemberAction(member.membershipId)
          : await reactivateMemberAction(member.membershipId)
      if (result.error) setError(result.error)
      else setConfirmingSuspend(false)
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      const result = await removeMemberAction(member.membershipId)
      if (result.error) setError(result.error)
      else setConfirmingRemove(false)
    })
  }

  const suspendCheck = canSuspend(actorRole, isSelf, member.role, isLastActiveOwner)
  const removeCheck = canRemove(actorRole, isSelf, member.role, isLastActiveOwner)
  // Productization wave 1 phase 3 — only a Staff member's own access is
  // ever restrictable; an owner always has full access by product
  // definition, and there's nothing to show on your own row.
  const showAccessPanel = !isSelf && member.role === "manager"

  return (
    <ListItemCard className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials(member.fullName ?? member.email ?? "?")}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{member.fullName ?? member.email ?? "Unknown"}</span>
              {isSelf && <span className="shrink-0 text-xs text-muted-foreground">(you)</span>}
              {member.status === "suspended" && (
                <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
                  Suspended
                </span>
              )}
            </div>
            <span className="truncate text-xs text-muted-foreground">
              {member.email} {member.branchName ? `· ${member.branchName}` : ""} · Since {formatDate(member.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
        {isSelf ? (
          <span className="text-xs text-muted-foreground">{ROLE_LABELS[member.role]}</span>
        ) : (
          <NativeSelect
            className={cn("min-w-36 w-auto")}
            value={member.role}
            disabled={isPending}
            onChange={(e) => changeRole(e.target.value as EmployeeRole)}
          >
            {(ROLE_OPTIONS.includes(member.role) ? ROLE_OPTIONS : [...ROLE_OPTIONS, member.role]).map((r) => {
              const check = canChangeRole(actorRole, isSelf, member.role, isLastActiveOwner, r)
              return (
                <option key={r} value={r} disabled={r !== member.role && !check.allowed}>
                  {ROLE_LABELS[r]}
                </option>
              )
            })}
          </NativeSelect>
        )}

        {!isSelf && (
          <>
            {member.status === "active" && confirmingSuspend ? (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setConfirmingSuspend(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={toggleSuspend} disabled={isPending}>
                  {isPending && <Loader2 className="animate-spin" />}
                  Suspend
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={member.status === "active" ? () => setConfirmingSuspend(true) : toggleSuspend}
                disabled={isPending || (member.status === "active" && !suspendCheck.allowed)}
                title={
                  member.status === "active"
                    ? suspendCheck.allowed
                      ? "Suspend"
                      : suspendCheck.reason
                    : "Reactivate"
                }
              >
                {isPending ? <Loader2 className="size-3.5 animate-spin" /> : member.status === "active" ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
              </Button>
            )}
            {confirmingRemove ? (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setConfirmingRemove(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={remove} disabled={isPending}>
                  Confirm
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmingRemove(true)}
                disabled={!removeCheck.allowed}
                title={removeCheck.allowed ? "Remove access" : removeCheck.reason}
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </Button>
            )}
          </>
        )}

        {showAccessPanel && (
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setAccessOpen((open) => !open)}
            aria-expanded={accessOpen}
            title={accessOpen ? "Hide access" : "Show access"}
          >
            <ChevronDown className={cn("size-3.5 transition-transform", accessOpen && "rotate-180")} />
          </Button>
        )}
      </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {showAccessPanel && (
        <Collapsible open={accessOpen}>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-3">
            {STAFF_ACCESS_SWITCHES.map((swtch) => {
              const checked = isSwitchOn(swtch.id, member.overrides)
              return (
                <div key={swtch.id} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-foreground">{swtch.label}</span>
                  <Switch
                    checked={checked}
                    disabled={pendingSwitchId === swtch.id}
                    onCheckedChange={(next) => toggleSwitch(swtch.id, next)}
                  />
                </div>
              )
            })}
            {accessError && <p className="text-xs text-destructive">{accessError}</p>}
          </div>
        </Collapsible>
      )}
    </ListItemCard>
  )
}

export { MemberRow }
