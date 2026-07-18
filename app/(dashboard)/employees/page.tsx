import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import { getTeamMembers, getPendingInvitations, getBranches } from "@/lib/data"
import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { InviteForm } from "@/components/domain/employees/invite-form"
import { MemberRow } from "@/components/domain/employees/member-row"
import { InvitationRow } from "@/components/domain/employees/invitation-row"

export default async function EmployeesPage() {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")
  if (!["owner", "manager"].includes(session.role)) redirect("/overview")

  const companyId = session.company.id
  const [members, invitations, branches] = await Promise.all([
    getTeamMembers(companyId),
    getPendingInvitations(companyId),
    getBranches(companyId),
  ])

  const activeOwnerCount = members.filter((m) => m.role === "owner" && m.status === "active").length

  return (
    <>
      <SectionHeader
        title="Team"
        description={members.length <= 1 ? "Just you for now — invite someone when you're ready." : `${members.length} people have access`}
      />

      <InviteForm branches={branches} actorRole={session.role} />

      <div className="flex flex-col gap-3">
        {members.map((member) => (
          <MemberRow
            key={member.membershipId}
            member={member}
            isSelf={member.userId === session.userId}
            actorRole={session.role}
            isLastActiveOwner={member.role === "owner" && member.status === "active" && activeOwnerCount <= 1}
          />
        ))}
      </div>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {invitations.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} />
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
