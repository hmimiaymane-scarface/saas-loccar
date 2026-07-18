"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { acceptInvitationAndRedirect } from "@/app/invite/actions"
import { Button } from "@/components/ui/button"

function AcceptInvitationButton({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitationAndRedirect(token)
            if (result?.error) setError(result.error)
          })
        }
      >
        {isPending && <Loader2 className="animate-spin" />}
        Accept and join
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export { AcceptInvitationButton }
