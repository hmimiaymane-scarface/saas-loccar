"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { DocumentConfidenceRow } from "@/components/domain/intelligence/document-confidence-row"
import { extractDocumentAction, classifyAndExtractDocumentAction } from "./actions"
import type { ExtractionResult, ClassifyAndExtractResult } from "@/lib/document-extraction"

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ")
  return String(value)
}

function ExtractionFields({ result }: { result: ExtractionResult }) {
  if (!result.ok) return <p className="text-sm text-destructive">{result.message}</p>
  return (
    <div className="flex flex-col divide-y divide-border rounded-2xl bg-muted/40 px-3">
      {Object.entries(result.fields).map(([key, field]) => (
        <DocumentConfidenceRow key={key} label={key} value={formatValue(field.value)} confidence={field.confidence} />
      ))}
    </div>
  )
}

function ExtractRow({ documentId, filename, category }: { documentId: string; filename: string; category: string }) {
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [classifyResult, setClassifyResult] = useState<ClassifyAndExtractResult | null>(null)
  const [pending, startTransition] = useTransition()
  const [classifyPending, startClassifyTransition] = useTransition()

  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{filename}</span>
          <span className="text-xs text-muted-foreground">{category}</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={classifyPending}
            onClick={() =>
              startClassifyTransition(async () => setClassifyResult(await classifyAndExtractDocumentAction(documentId)))
            }
          >
            {classifyPending ? "Classifying…" : "Classify + Extract"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(async () => setResult(await extractDocumentAction(documentId)))}
          >
            {pending ? "Extracting…" : "Extract"}
          </Button>
        </div>
      </div>

      {classifyResult?.ok && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Detected: <span className="font-medium text-foreground">{classifyResult.category}</span> (
            {classifyResult.classificationConfidence}% confidence)
          </p>
          {classifyResult.extraction && <ExtractionFields result={classifyResult.extraction} />}
        </div>
      )}
      {classifyResult && !classifyResult.ok && <p className="text-sm text-destructive">{classifyResult.message}</p>}

      {result && <ExtractionFields result={result} />}
    </div>
  )
}

export { ExtractRow }
