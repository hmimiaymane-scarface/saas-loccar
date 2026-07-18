"use client"

import { useState } from "react"
import { FileText, Loader2, CheckCircle2 } from "lucide-react"

import { buildStoragePath, validateFile, ACCEPTED_DOCUMENT_MIME_TYPES } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { attachExpenseReceipt } from "@/app/(dashboard)/expenses/actions"
import { cn } from "@/lib/utils"

function ExpenseReceiptUpload({
  expenseId,
  companyId,
  hasReceipt,
}: {
  expenseId: string
  companyId: string
  hasReceipt: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [uploaded, setUploaded] = useState(hasReceipt)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    const validationError = validateFile(file, ACCEPTED_DOCUMENT_MIME_TYPES)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(true)
    const path = buildStoragePath(companyId, ["expenses", expenseId], file.name)
    const upload = await uploadFile(path, file)
    if (upload.error) {
      setError(upload.error)
      setBusy(false)
      return
    }
    const result = await attachExpenseReceipt(expenseId, path)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setUploaded(true)
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        className={cn(
          "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border px-3 py-3 transition-colors hover:bg-muted",
          uploaded && "border-emerald-300 dark:border-emerald-500/40"
        )}
      >
        <input
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ""
          }}
        />
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              uploaded
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {uploaded ? <CheckCircle2 className="size-4" /> : <FileText className="size-4" />}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium text-foreground">Receipt or invoice</span>
            <span className="truncate text-xs text-muted-foreground">{uploaded ? "Uploaded" : "Not uploaded"}</span>
          </div>
        </div>
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <span className="shrink-0 text-xs font-medium text-primary">{uploaded ? "Replace" : "Upload"}</span>
        )}
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { ExpenseReceiptUpload }
