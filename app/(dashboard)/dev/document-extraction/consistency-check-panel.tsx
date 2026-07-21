"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { checkConsistencyAction } from "./actions"
import type { ConsistencyIssue } from "@/lib/document-consistency"

/** Roadmap phase 04 requirement 6 demo. Live-Supabase only — requires
 * real document_extractions rows to compare, so this returns a typed
 * error (shown inline, not thrown) without a live project. */
function ConsistencyCheckPanel() {
  const [customerId, setCustomerId] = useState("")
  const [result, setResult] = useState<ConsistencyIssue[] | { error: string } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="consistency-customer-id">Customer ID</Label>
        <Input
          id="consistency-customer-id"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          placeholder="Paste a customer id"
        />
      </div>
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !customerId.trim()}
          onClick={() => startTransition(async () => setResult(await checkConsistencyAction(customerId)))}
        >
          {pending ? "Checking…" : "Check consistency"}
        </Button>
      </div>
      {result && "error" in result && <p className="text-sm text-destructive">{result.error}</p>}
      {result && Array.isArray(result) && result.length === 0 && (
        <p className="text-sm text-muted-foreground">No mismatches found across this customer&apos;s documents.</p>
      )}
      {result && Array.isArray(result) && result.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {result.map((issue) => (
            <li
              key={issue.field}
              className="rounded-2xl bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
            >
              <span className="font-medium">{issue.field}</span> disagrees across documents:{" "}
              {issue.values.map((v) => `${v.category}: "${v.value}"`).join(", ")}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export { ConsistencyCheckPanel }
