"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileSignature, Loader2 } from "lucide-react"

import { generateContractAction } from "@/app/(dashboard)/contract-templates/actions"
import { Button } from "@/components/ui/button"

/** Roadmap phase 10 requirement 3's actual generation entry point —
 * "stop the fast path at 'everything is ready to generate a
 * contract'" (this phase's own non-goal 5) means this button, not a
 * contract-signing flow, is where phase 10 ends. */
function GenerateContractButton({ reservationId }: { reservationId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await generateContractAction(reservationId)
            if (!result.ok) {
              setError(result.error)
              return
            }
            router.push(`/contracts/${result.contractId}`)
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <FileSignature />}
        Generate contract
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { GenerateContractButton }
