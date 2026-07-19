"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Trash2, Loader2 } from "lucide-react"

import { createConversation, deleteConversation, type ConversationSummaryRow } from "@/app/(dashboard)/ai-assistant/actions"
import { AI_PROVIDER_LABELS, type AiProvider } from "@/lib/ai/models"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/native-select"

function ConversationSidebar({
  conversations,
  activeId,
  availableProviders,
}: {
  conversations: ConversationSummaryRow[]
  activeId: string | null
  availableProviders: AiProvider[]
}) {
  const router = useRouter()
  const [provider, setProvider] = useState<AiProvider>(availableProviders[0] ?? "anthropic")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function newChat() {
    setError(null)
    startTransition(async () => {
      const result = await createConversation(provider)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/ai-assistant?c=${result.conversationId}`)
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteConversation(id)
      if (id === activeId) router.push("/ai-assistant")
      else router.refresh()
    })
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-col gap-2">
        {availableProviders.length > 1 && (
          <NativeSelect value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
            {availableProviders.map((p) => (
              <option key={p} value={p}>
                {AI_PROVIDER_LABELS[p]}
              </option>
            ))}
          </NativeSelect>
        )}
        <Button type="button" onClick={newChat} disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          New chat
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">No conversations yet.</p>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-2xl px-1",
                c.id === activeId ? "bg-muted" : "hover:bg-muted/60"
              )}
            >
              <Link
                href={`/ai-assistant?c=${c.id}`}
                className="flex min-w-0 flex-1 flex-col gap-0.5 px-2.5 py-2"
              >
                <span className="truncate text-sm text-foreground">{c.title ?? "New conversation"}</span>
                <span className="text-[11px] text-muted-foreground">
                  {AI_PROVIDER_LABELS[c.provider]} · {formatRelativeTime(c.updatedAt)}
                </span>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 opacity-0 group-hover:opacity-100"
                onClick={() => remove(c.id)}
                aria-label="Delete conversation"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export { ConversationSidebar }
