"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { logProductSignal } from "@/app/platform/actions"
import { PRODUCT_SIGNAL_TYPES } from "@/lib/platform/product-signals"
import type { ProductSignalItem } from "@/types/platform"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { ProductSignalRow } from "@/components/domain/platform/product-signal-row"

/**
 * Roadmap phase 64 (Pilot Feedback Loop) — the per-company half of the
 * feedback loop: log a real observation the moment it happens (during
 * a call, a site visit, a WhatsApp thread), see this company's own
 * signals ranked by impact x frequency. The cross-pilot ranked view
 * lives separately at /platform/product-signals.
 */
function ProductSignalLog({ companyId, signals }: { companyId: string; signals: ProductSignalItem[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [signalType, setSignalType] = useState(PRODUCT_SIGNAL_TYPES[0].key)
  const [note, setNote] = useState("")
  const [impact, setImpact] = useState("2")
  const [frequency, setFrequency] = useState("2")

  function submit() {
    if (!note.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await logProductSignal(companyId, signalType, note.trim(), Number(impact), Number(frequency))
      if (result.error) setError(result.error)
      else {
        setNote("")
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product signals</CardTitle>
        <CardDescription>What this pilot&apos;s real behavior is telling us — see docs/pilot-feedback-loop.md.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Signal type</Label>
              <NativeSelect value={signalType} onChange={(e) => setSignalType(e.target.value)}>
                {PRODUCT_SIGNAL_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Impact (1-3)</Label>
              <NativeSelect value={impact} onChange={(e) => setImpact(e.target.value)}>
                <option value="1">1 — minor</option>
                <option value="2">2 — noticeable</option>
                <option value="3">3 — significant</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Frequency (1-3)</Label>
              <NativeSelect value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="1">1 — once</option>
                <option value="2">2 — sometimes</option>
                <option value="3">3 — every time</option>
              </NativeSelect>
            </div>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you actually see or hear?"
            rows={2}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={isPending || !note.trim()} onClick={submit}>
              {isPending && <Loader2 className="animate-spin" />}
              Log observation
            </Button>
          </div>
        </div>

        <div className="flex flex-col divide-y divide-border">
          {signals.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No signals logged yet for this pilot.</p>
          ) : (
            signals.map((s) => <ProductSignalRow key={s.id} signal={s} />)
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export { ProductSignalLog }
