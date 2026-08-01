"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

import { submitFeedback, type SupportActionState } from "@/app/(dashboard)/support/actions"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { SubmitButton } from "@/components/ui/submit-button"
import { useSlowPending } from "@/hooks/use-slow-pending"

const initialState: SupportActionState = {}
const SAVED_CONFIRMATION_MS = 2_000

/**
 * Roadmap phase 63 (Pilot Onboarding Package) — the in-app "tell us
 * something's wrong (or right)" surface a pilot uses instead of hunting
 * for the founder's phone number every time. `pageContext` is whatever
 * page the pilot was actually on when they opened this — same value a
 * support screenshot would otherwise have to convey by hand.
 */
function FeedbackForm() {
  const [state, formAction, isPending] = useActionState(submitFeedback, initialState)
  const isSlowPending = useSlowPending(isPending)
  const pathname = usePathname()
  const formRef = useRef<HTMLFormElement>(null)

  const wasPendingRef = useRef(false)
  const [justSaved, setJustSaved] = useState(false)
  useEffect(() => {
    const finishedSuccessfully = wasPendingRef.current && !isPending && state.success
    wasPendingRef.current = isPending
    if (!finishedSuccessfully) return
    formRef.current?.reset()
    setJustSaved(true)
    const timer = setTimeout(() => setJustSaved(false), SAVED_CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [isPending, state])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send feedback</CardTitle>
        <CardDescription>
          Confusing screen, missing feature, something that just feels off — tell us directly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="pageContext" value={pathname} />
          <Textarea
            name="message"
            required
            minLength={1}
            maxLength={4000}
            rows={4}
            placeholder="What's on your mind?"
          />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end">
            <SubmitButton
              type="submit"
              status={isPending ? (isSlowPending ? "slow" : "pending") : justSaved ? "saved" : "idle"}
              savedLabel="Sent"
            >
              Send feedback
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export { FeedbackForm }
