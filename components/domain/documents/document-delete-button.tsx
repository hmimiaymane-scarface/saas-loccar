"use client"

import { useState, useTransition } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { deleteDocument } from "@/app/(dashboard)/documents/actions"
import { Button } from "@/components/ui/button"

function DocumentDeleteButton({ documentId }: { documentId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!confirming) {
    return (
      <Button variant="ghost" size="icon" onClick={() => setConfirming(true)} title="Delete document">
        <Trash2 className="size-4 text-muted-foreground" />
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteDocument(documentId)
            if (result.error) setError(result.error)
          })
        }
      >
        {isPending && <Loader2 className="animate-spin" />}
        Delete
      </Button>
    </div>
  )
}

export { DocumentDeleteButton }
