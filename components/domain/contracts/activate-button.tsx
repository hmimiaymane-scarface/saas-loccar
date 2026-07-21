"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2 } from "lucide-react"

import { activateVersionAction } from "@/app/(dashboard)/contract-templates/actions"
import { Button } from "@/components/ui/button"

/** The literal "owner reviews and confirms" gate (requirement 2) — a
 * pending_review version becomes usable for real contract generation
 * only after this is clicked. */
function ActivateButton({ templateId, versionId }: { templateId: string; versionId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await activateVersionAction(templateId, versionId)
            if (!result.ok) {
              setError(result.error)
              return
            }
            router.refresh()
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
        Confirm and activate
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { ActivateButton }
