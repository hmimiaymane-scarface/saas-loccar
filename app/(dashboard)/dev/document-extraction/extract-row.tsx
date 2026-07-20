"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { DocumentConfidenceRow } from "@/components/domain/intelligence/document-confidence-row"
import { extractDocumentAction } from "./actions"
import type { ExtractionResult } from "@/lib/document-extraction"

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ")
  return String(value)
}

function ExtractRow({ documentId, filename, category }: { documentId: string; filename: string; category: string }) {
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{filename}</span>
          <span className="text-xs text-muted-foreground">{category}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => setResult(await extractDocumentAction(documentId)))}
        >
          {pending ? "Extracting…" : "Extract"}
        </Button>
      </div>
      {result?.ok ? (
        <div className="flex flex-col divide-y divide-border rounded-2xl bg-muted/40 px-3">
          {Object.entries(result.fields).map(([key, field]) => (
            <DocumentConfidenceRow key={key} label={key} value={formatValue(field.value)} confidence={field.confidence} />
          ))}
        </div>
      ) : null}
      {result && !result.ok ? <p className="text-sm text-destructive">{result.message}</p> : null}
    </div>
  )
}

export { ExtractRow }
