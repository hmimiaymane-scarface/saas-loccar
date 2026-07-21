"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload } from "lucide-react"

import { buildStoragePath, validateFile } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { proposeTemplateAction } from "@/app/(dashboard)/contract-templates/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"

const LANGUAGE_OPTIONS = [
  { value: "fr", label: "French" },
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
]

/** Roadmap phase 10 requirement 1's entry point. PDF only, per the
 * phase brief's own "safer starting point" guidance — see
 * docs/contracts.md. Uploads straight to Storage from the browser
 * (same convention as `document-upload-row.tsx`), then hands the
 * resulting path to the server action, which downloads it again
 * server-side to extract text and call the AI service. */
function TemplateUploadForm({ companyId }: { companyId: string }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [language, setLanguage] = useState("fr")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    const validationError = validateFile(file, ["application/pdf"])
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setBusy(true)
    setStatus("Uploading file…")
    const path = buildStoragePath(companyId, ["contract-templates"], file.name)
    const upload = await uploadFile(path, file)
    if (upload.error) {
      setError(upload.error)
      setBusy(false)
      setStatus(null)
      return
    }
    setStatus("Reading the document and proposing a variable mapping — this can take a moment…")
    const result = await proposeTemplateAction({ name, language, storagePath: path })
    setBusy(false)
    setStatus(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/contract-templates/${result.templateId}/versions/${result.versionId}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="templateName">Template name</Label>
        <Input id="templateName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard rental agreement" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="templateLanguage">Language</Label>
        <NativeSelect id="templateLanguage" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="templateFile">Existing contract (PDF)</Label>
        <Input id="templateFile" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      </div>
      {status && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {status}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !file || !name.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}
          Upload and analyze
        </Button>
      </div>
    </form>
  )
}

export { TemplateUploadForm }
