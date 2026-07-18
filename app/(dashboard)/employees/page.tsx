import { UserCog } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function EmployeesPage() {
  return (
    <>
      <SectionHeader
        title="Employees"
        description="Team members, roles and permissions"
      />
      <EmptyPlaceholder
        icon={UserCog}
        title="Team management is coming next"
        description="Invite your team, assign roles like manager or agent, and control what each person can see and do."
      />
    </>
  )
}
