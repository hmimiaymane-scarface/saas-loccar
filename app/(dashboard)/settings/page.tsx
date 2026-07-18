import { Settings } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function SettingsPage() {
  return (
    <>
      <SectionHeader
        title="Settings"
        description="Company profile, branding and preferences"
      />
      <EmptyPlaceholder
        icon={Settings}
        title="Settings are coming next"
        description="Manage your company profile, branding, locations and billing from here."
      />
    </>
  )
}
