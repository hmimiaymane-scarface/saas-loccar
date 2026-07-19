"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Loader2, Send, Sparkles } from "lucide-react"

import { saveMessage, type StoredMessage } from "@/app/(dashboard)/ai-assistant/actions"
import type { AiProvider } from "@/lib/ai/models"
import type { ProposedAction } from "@/types/ai"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ProposedActionCard } from "@/components/domain/ai-assistant/proposed-action-card"

interface LiveProposal {
  proposalId: string
  summary: string
}

function textOf(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
}

/** Chat for one conversation. Deliberately re-mounted per conversation
 * (see the `key` prop where this is used) rather than trying to update
 * the transport in place — a fresh hook instance per conversation avoids
 * any stale-closure risk around which conversation a message belongs to. */
function ChatPanel({
  conversationId,
  provider,
  initialMessages,
  initialProposals,
  initialInput,
}: {
  conversationId: string
  provider: AiProvider
  initialMessages: StoredMessage[]
  initialProposals: ProposedAction[]
  initialInput?: string
}) {
  const [input, setInput] = useState(initialInput ?? "")
  const scrollRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai-assistant/chat", body: { conversationId, provider } }),
    [conversationId, provider]
  )

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    transport,
    messages: initialMessages
      .filter((m) => m.role !== "tool")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        parts: [{ type: "text" as const, text: m.content ?? "" }],
      })),
    onFinish: ({ message }) => {
      const text = textOf(message.parts as { type: string; text?: string }[])
      if (text) void saveMessage(conversationId, "assistant", text)
    },
  })

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  // Proposals resolved before this page load come from the database (the
  // source of truth for their status); proposals the model creates during
  // this live session are picked up straight from the streamed tool
  // output so they show up without waiting for a refetch.
  const liveProposals = useMemo(() => {
    const found: LiveProposal[] = []
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          typeof part.type === "string" &&
          part.type.startsWith("tool-propose_") &&
          "state" in part &&
          part.state === "output-available" &&
          "output" in part &&
          part.output &&
          typeof part.output === "object" &&
          "proposalId" in part.output
        ) {
          const output = part.output as { proposalId: string; summary: string }
          if (!found.some((p) => p.proposalId === output.proposalId)) {
            found.push({ proposalId: output.proposalId, summary: output.summary })
          }
        }
      }
    }
    return found
  }, [messages])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput("")
    void saveMessage(conversationId, "user", text)
    void sendMessage({ text })
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <Sparkles className="size-8" />
            <p className="text-sm">Ask about today&apos;s schedule, look up a customer, or ask it to prepare a booking.</p>
          </div>
        )}

        {initialProposals
          .filter((p) => !liveProposals.some((lp) => lp.proposalId === p.id))
          .map((p) => (
            <ProposedActionCard
              key={p.id}
              proposalId={p.id}
              summary={p.summary}
              initialStatus={p.status === "confirmed" ? "confirmed" : p.status === "pending" ? "pending" : "rejected"}
            />
          ))}

        {messages.map((message) => {
          const text = textOf(message.parts as { type: string; text?: string }[])
          if (!text && message.role === "assistant") return null
          return (
            <div
              key={message.id}
              className={cn("flex flex-col gap-1", message.role === "user" ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-3xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                )}
              >
                {text}
              </div>
            </div>
          )
        })}

        {liveProposals.map((p) => (
          <ProposedActionCard key={p.proposalId} proposalId={p.proposalId} summary={p.summary} />
        ))}

        {(status === "submitted" || status === "streaming") && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Thinking…
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error.message || "Something went wrong — try again."}
          </p>
        )}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the assistant…"
          className="flex h-11 w-full flex-1 rounded-full border border-border bg-background px-4 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          disabled={status === "streaming" || status === "submitted"}
        />
        <Button type="submit" size="icon" disabled={!input.trim() || status === "streaming" || status === "submitted"}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}

export { ChatPanel }
