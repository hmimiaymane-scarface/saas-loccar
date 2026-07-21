"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { checkDuplicateCandidatesAction } from "./actions"
import type { DuplicateMatch } from "@/lib/customer-matching"

/** Roadmap phase 04 requirement 5 demo. The one panel on this page that
 * actually produces a result without a live Supabase project —
 * findDuplicateCandidates is mock-mode-aware, so this scores against the
 * fixture customers in lib/mock/customers.ts. Try "Ahmed Tazi" +
 * licence "MA-204471" for an obvious hit. */
function DuplicateCheckPanel() {
  const [fullName, setFullName] = useState("")
  const [licenseNumber, setLicenseNumber] = useState("")
  const [idDocumentNumber, setIdDocumentNumber] = useState("")
  const [results, setResults] = useState<DuplicateMatch[] | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dup-full-name">Full name</Label>
          <Input id="dup-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ahmed Tazi" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dup-license">Licence number</Label>
          <Input
            id="dup-license"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            placeholder="Optional, e.g. MA-204471"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dup-id">ID document number</Label>
          <Input id="dup-id" value={idDocumentNumber} onChange={(e) => setIdDocumentNumber(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !fullName.trim()}
          onClick={() =>
            startTransition(async () =>
              setResults(
                await checkDuplicateCandidatesAction({
                  fullName,
                  licenseNumber: licenseNumber || undefined,
                  idDocumentNumber: idDocumentNumber || undefined,
                })
              )
            )
          }
        >
          {pending ? "Checking…" : "Check for duplicates"}
        </Button>
      </div>
      {results && results.length === 0 && <p className="text-sm text-muted-foreground">No likely duplicates found.</p>}
      {results && results.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {results.map((r) => (
            <li
              key={r.customerId}
              className="flex items-center justify-between rounded-2xl bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
            >
              <span>
                {r.fullName} — {r.confidence}% match ({r.matchedFields.join(", ")})
              </span>
              {r.isLikelyDuplicate && <span className="text-xs font-medium">Likely duplicate</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export { DuplicateCheckPanel }
