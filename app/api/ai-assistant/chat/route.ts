import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai"

import { getSessionContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { resolveModel, isConfigured, type AiProvider } from "@/lib/ai/models"
import { buildSystemPrompt } from "@/lib/ai/system-prompt"
import { buildTools } from "@/lib/ai/tools"

export const maxDuration = 60

interface ChatRequestBody {
  messages: UIMessage[]
  conversationId: string
  provider: AiProvider
}

export async function POST(req: Request) {
  const session = await getSessionContext()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const body = (await req.json()) as ChatRequestBody
  const { messages, conversationId, provider } = body

  if (!conversationId) return new Response("Missing conversationId", { status: 400 })
  if (provider !== "openai" && provider !== "anthropic") return new Response("Invalid provider", { status: 400 })
  if (!isConfigured(provider)) {
    return new Response(
      `The ${provider === "openai" ? "OpenAI" : "Anthropic"} API key isn't configured on the server yet.`,
      { status: 503 }
    )
  }

  // Ownership check — RLS would block a cross-user read/write anyway, but
  // failing fast here avoids spending a model call on a request that
  // could never succeed.
  const supabase = await createClient()
  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", session.userId)
    .maybeSingle()
  if (!conversation) return new Response("Conversation not found", { status: 404 })

  // A simple per-user rate limit — no external store needed: RLS on
  // ai_messages already restricts SELECT to rows in this user's own
  // conversations, so this count can only ever reflect their own recent
  // activity. Generous enough for normal use, tight enough to bound a
  // runaway loop or accidental double-submit storm.
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
  const { count: recentCount } = await supabase
    .from("ai_messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", oneMinuteAgo)
  if ((recentCount ?? 0) >= 12) {
    return new Response("Too many requests — wait a moment before sending another message.", { status: 429 })
  }

  const tools = await buildTools(session, conversationId)
  const modelMessages = await convertToModelMessages(messages)

  const result = streamText({
    model: resolveModel(provider),
    system: buildSystemPrompt(session),
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(6),
  })

  return result.toUIMessageStreamResponse()
}
