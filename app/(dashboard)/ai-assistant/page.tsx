import { redirect } from "next/navigation"

import { getSessionContext } from "@/lib/auth/session"
import {
  listConversations,
  getConversationMessages,
  getProposedActions,
} from "@/app/(dashboard)/ai-assistant/actions"
import { isConfigured } from "@/lib/ai/models"
import { isSupabaseConfigured } from "@/lib/env"
import { SectionHeader } from "@/components/domain/section-header"
import { EmptyPlaceholder } from "@/components/domain/empty-placeholder"
import { ConversationSidebar } from "@/components/domain/ai-assistant/conversation-sidebar"
import { ChatPanel } from "@/components/domain/ai-assistant/chat-panel"
import { SuggestionsPanel } from "@/components/domain/ai-assistant/suggestions-panel"
import { Card, CardContent } from "@/components/ui/card"
import { Sparkles } from "lucide-react"

export default async function AiAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; seed?: string }>
}) {
  const session = await getSessionContext()
  if (!session) redirect("/sign-in")

  const params = await searchParams

  // listConversations() calls createClient() unconditionally, which
  // throws in mock mode — checked here explicitly rather than letting
  // that surface as an unhandled crash (productization wave 1 phase 8).
  // Distinct from the AI-provider-key `configured` check below.
  if (!isSupabaseConfigured) {
    return (
      <>
        <SectionHeader title="AI Assistant" description="Ask a question, or have it draft bookings and payments for you to approve." />
        <EmptyPlaceholder
          icon={Sparkles}
          title="AI Assistant needs a connected Supabase project"
          description="Not available in demo mode — conversations are stored per company."
        />
      </>
    )
  }

  const conversations = await listConversations()
  const activeId = params.c ?? conversations[0]?.id ?? null
  const active = activeId ? conversations.find((c) => c.id === activeId) : undefined
  const canSeeSuggestions = session.role === "owner" || session.role === "manager"

  const [messages, proposals] = activeId
    ? await Promise.all([getConversationMessages(activeId), getProposedActions(activeId)])
    : [[], []]

  const configuredProviders = (["anthropic", "openai"] as const).filter((p) => isConfigured(p))
  const configured = configuredProviders.length > 0

  return (
    <>
      <SectionHeader title="AI Assistant" description="Ask about your data, or have it prepare bookings and payments for you to confirm." />

      {!configured ? (
        <EmptyPlaceholder
          icon={Sparkles}
          title="AI Assistant isn't configured yet"
          description="Add an OpenAI or Anthropic API key to your environment to turn this on."
        />
      ) : (
        <>
          {canSeeSuggestions && <SuggestionsPanel />}

          <Card className="h-[calc(100vh-18rem)] min-h-[28rem] overflow-hidden">
            <CardContent className="grid h-full grid-cols-1 gap-0 p-0 md:grid-cols-[16rem_1fr]">
              <div className="max-h-56 overflow-y-auto border-b border-border p-3 md:max-h-none md:border-b-0 md:border-r">
                <ConversationSidebar conversations={conversations} activeId={activeId} availableProviders={configuredProviders} />
              </div>
              <div className="flex flex-col p-4">
                {activeId && active ? (
                  <ChatPanel
                    key={activeId}
                    conversationId={activeId}
                    provider={active.provider}
                    initialMessages={messages}
                    initialProposals={proposals}
                    initialInput={params.seed}
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                    <Sparkles className="size-8" />
                    <p className="text-sm">Start a new chat from the sidebar.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
