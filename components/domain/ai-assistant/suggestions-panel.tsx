"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Lightbulb, Loader2, MessageCircle } from "lucide-react"

import { generateSuggestions, createConversation, type Suggestion } from "@/app/(dashboard)/ai-assistant/actions"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

/** Purely on-demand — no background job, no polling. The owner asks for
 * suggestions when they want them; nothing is generated or shown
 * without that explicit request. */
function SuggestionsPanel() {
  const router = useRouter()
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function load() {
    setError(null)
    startTransition(async () => {
      const result = await generateSuggestions()
      if (result.error) {
        setError(result.error)
        return
      }
      setSuggestions(result.suggestions ?? [])
    })
  }

  function discuss(suggestion: Suggestion) {
    startTransition(async () => {
      const result = await createConversation("anthropic")
      if (result.conversationId) {
        const seed = encodeURIComponent(`${suggestion.title} — ${suggestion.detail}`)
        router.push(`/ai-assistant?c=${result.conversationId}&seed=${seed}`)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Lightbulb className="size-4" />
          Suggestions for today
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {suggestions === null ? (
          <Button type="button" variant="outline" onClick={load} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <Lightbulb />}
            Get today&apos;s suggestions
          </Button>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing stands out right now — all clear.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-2xl border border-border p-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{s.title}</span>
                  <span className="text-xs text-muted-foreground">{s.detail}</span>
                </div>
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => discuss(s)} disabled={isPending}>
                  <MessageCircle className="size-3.5" />
                  Discuss in chat
                </Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={load} disabled={isPending} className="self-start">
              {isPending && <Loader2 className="animate-spin" />}
              Refresh
            </Button>
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export { SuggestionsPanel }
