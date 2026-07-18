"use client"

import { useState, useTransition } from "react"
import { UserX, UserCheck, Trash2, Loader2 } from "lucide-react"

import { updateMemberRoleAction, suspendMemberAction, reactivateMemberAction, removeMemberAction } from "@/app/(dashboard)/employees/actions"
import { canChangeRole, canSuspend, canRemove } from "@/lib/team-rules"
import { ROLE_LABELS } from "@/lib/roles"
import { formatDate, initials } from "@/lib/format"
import type { EmployeeRole, TeamMember } from "@/types/rental"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/native-select"
import { cn } from "@/lib/utils"

const ROLE_OPTIONS: EmployeeRole[] = ["owner", "manager", "agent", "accountant", "driver"]

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

  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>{initials(member.fullName ?? member.email ?? "?")}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{member.fullName ?? member.email ?? "Unknown"}</span>
            {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
            {member.status === "suspended" && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
                Suspended
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {member.email} {member.branchName ? `· ${member.branchName}` : ""} · Since {formatDate(member.createdAt)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isSelf ? (
          <span className="text-xs text-muted-foreground">{ROLE_LABELS[member.role]}</span>
        ) : (
          <NativeSelect
            className={cn("w-36")}
            value={member.role}
            disabled={isPending}
            onChange={(e) => changeRole(e.target.value as EmployeeRole)}
          >
            {ROLE_OPTIONS.map((r) => {
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
            <Button
              variant="outline"
              size="icon-sm"
              onClick={toggleSuspend}
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
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { MemberRow }
