import { Sparkles } from "lucide-react"

import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"

export default function AiAssistantPage() {
  return (
    <>
      <SectionHeader
        title="AI Assistant"
        description="Optional AI help for your daily work"
      />
      <EmptyPlaceholder
        icon={Sparkles}
        title="AI Assistant is coming next"
        description="An optional, separate assistant to help with day-to-day tasks. It stays out of the way until you open it."
      />
    </>
  )
}
