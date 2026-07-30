"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { updateNotes } from "@/app/platform/actions"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

function NotesEditor({
  companyId,
  notes,
  notesUpdatedAt,
  notesUpdatedByEmail,
}: {
  companyId: string
  notes: string | null
  notesUpdatedAt: string | null
  notesUpdatedByEmail: string | null
}) {
  const router = useRouter()
  const [value, setValue] = useState(notes ?? "")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateNotes(companyId, value)
      if (result.error) setError(result.error)
      else {
        setSaved(true)
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal notes</CardTitle>
        <CardDescription>Never shown to the rental company — first contact source, agreed price, support context…</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={4} placeholder="Nothing recorded yet." />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {notesUpdatedAt ? `Last updated ${formatDate(notesUpdatedAt)}${notesUpdatedByEmail ? ` by ${notesUpdatedByEmail}` : ""}` : "Never updated."}
          </p>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
            <Button type="button" size="sm" disabled={isPending} onClick={save}>
              {isPending && <Loader2 className="animate-spin" />}
              Save notes
            </Button>
          </div>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export { NotesEditor }
