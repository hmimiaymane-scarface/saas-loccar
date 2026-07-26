"use client"

import { useActionState, useState } from "react"
import { Loader2, UserPlus } from "lucide-react"

import { inviteMember, type TeamActionState } from "@/app/(dashboard)/employees/actions"
import { canInvite } from "@/lib/team-rules"
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/roles"
import type { Branch, EmployeeRole } from "@/types/rental"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

// Productization wave 1 phase 2 — the visible product only offers two
// roles: Owner and Staff (backed by the existing "manager" role, which
// already has near-owner-equivalent permission defaults). The other 5
// EmployeeRole values still exist at the database level (reduces
// rewrite risk — see docs/permissions.md) but are no longer selectable
// here.
const INVITABLE_ROLES: EmployeeRole[] = ["manager", "owner"]

const initialState: TeamActionState = {}

function InviteForm({ branches, actorRole }: { branches: Branch[]; actorRole: EmployeeRole }) {
  const [state, formAction, isPending] = useActionState(inviteMember, initialState)
  const [role, setRole] = useState<EmployeeRole>("manager")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <UserPlus className="size-4" /> Invite a team member
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="colleague@email.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">Role</Label>
              <NativeSelect id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as EmployeeRole)}>
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r} disabled={!canInvite(actorRole, r).allowed}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {branches.length > 1 && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="branchId">Branch (optional)</Label>
                <NativeSelect id="branchId" name="branchId" defaultValue="">
                  <option value="">Company-wide</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Send invitation
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export { InviteForm }
