"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload } from "lucide-react"

import { buildStoragePath, validateFile, ACCEPTED_DOCUMENT_MIME_TYPES } from "@/lib/storage"
import { uploadFile } from "@/lib/storage-client"
import { createDocumentRecord } from "@/app/(dashboard)/documents/actions"
import type { Customer, DocumentCategory, Vehicle } from "@/types/rental"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { CATEGORY_OPTIONS } from "@/components/domain/documents/document-filters"

type LinkType = "customer" | "vehicle"

function NewDocumentForm({ companyId, customers, vehicles }: { companyId: string; customers: Customer[]; vehicles: Vehicle[] }) {
  const router = useRouter()
  const [category, setCategory] = useState<DocumentCategory>("identity_document")
  const [linkType, setLinkType] = useState<LinkType>("customer")
  const [linkId, setLinkId] = useState(customers[0]?.id ?? "")
  const [contractReference, setContractReference] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const linkOptions = linkType === "customer" ? customers.map((c) => ({ id: c.id, label: c.fullName })) : vehicles.map((v) => ({ id: v.id, label: `${v.make} ${v.model} · ${v.plate}` }))

  async function handleFile(file: File) {
    setError(null)
    if (!linkId) {
      setError(linkType === "customer" ? "Choose a customer first." : "Choose a vehicle first.")
      return
    }
    const validationError = validateFile(file, ACCEPTED_DOCUMENT_MIME_TYPES)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(true)
    const path = buildStoragePath(companyId, ["documents", linkId], file.name)
    const upload = await uploadFile(path, file)
    if (upload.error) {
      setError(upload.error)
      setBusy(false)
      return
    }
    const result = await createDocumentRecord({
      category,
      storagePath: path,
      originalFilename: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      customerId: linkType === "customer" ? linkId : undefined,
      vehicleId: linkType === "vehicle" ? linkId : undefined,
      contractReference: contractReference || undefined,
    })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a document</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <NativeSelect id="category" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="linkType">Attach to</Label>
            <NativeSelect
              id="linkType"
              value={linkType}
              onChange={(e) => {
                const next = e.target.value as LinkType
                setLinkType(next)
                setLinkId(next === "customer" ? customers[0]?.id ?? "" : vehicles[0]?.id ?? "")
              }}
            >
              <option value="customer">Customer</option>
              <option value="vehicle">Vehicle</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="linkId">{linkType === "customer" ? "Customer" : "Vehicle"}</Label>
            <NativeSelect id="linkId" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
              {linkOptions.length === 0 && <option value="">None available</option>}
              {linkOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="contractReference">Reference (optional)</Label>
            <Input
              id="contractReference"
              value={contractReference}
              onChange={(e) => setContractReference(e.target.value)}
              placeholder="e.g. contract number"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-dashed border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
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
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Choose file to upload
        </label>
      </CardContent>
    </Card>
  )
}

export { NewDocumentForm }
