"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, FileSignature } from "lucide-react"

import { generateContractAction } from "@/app/(dashboard)/contract-templates/actions"
import { Button } from "@/components/ui/button"

function GenerateContractConfirmButton({ reservationId, disabled }: { reservationId: string; disabled: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={disabled || pending}
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
      {error && <p className="max-w-sm text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { GenerateContractConfirmButton }
