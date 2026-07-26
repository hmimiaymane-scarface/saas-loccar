"use client"

import { useTransition } from "react"
import Link from "next/link"
import { FileText, User, Car, ClipboardList } from "lucide-react"

import type { RentalDocument } from "@/types/rental"
import { formatDateTime, formatFileSize } from "@/lib/format"
import { CATEGORY_OPTIONS } from "@/lib/documents"
import { logDocumentAccess } from "@/app/(dashboard)/documents/actions"
import { DocumentDeleteButton } from "@/components/domain/documents/document-delete-button"

function DocumentListItem({ document: doc, canDelete }: { document: RentalDocument; canDelete: boolean }) {
  const [, startTransition] = useTransition()
  const categoryLabel = CATEGORY_OPTIONS.find((c) => c.value === doc.category)?.label ?? doc.category

  // Roadmap phase 19 — best-effort, fire-and-forget: a failed access
  // log must never stop someone from actually opening the document
  // (same convention as logContractPrintedAction's own call site).
  function logAccess() {
    startTransition(async () => {
      await logDocumentAccess(doc.id, "viewed").catch(() => {})
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm">
      <a
        href={doc.url ?? "#"}
        target="_blank"
        rel="noreferrer"
        onClick={logAccess}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <FileText className="size-4" />
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <a href={doc.url ?? "#"} target="_blank" rel="noreferrer" onClick={logAccess} className="truncate text-sm font-medium text-foreground hover:underline">
          {doc.originalFilename}
        </a>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{categoryLabel}</span>
          <span>{formatFileSize(doc.fileSizeBytes)}</span>
          <span>{formatDateTime(doc.createdAt)}</span>
          {doc.uploadedByName && <span>by {doc.uploadedByName}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {doc.reservationId && (
            <Link href={`/reservations/${doc.reservationId}`} className="flex items-center gap-1 text-primary hover:underline">
              <ClipboardList className="size-3" /> Reservation
            </Link>
          )}
          {doc.customerId && (
            <Link href={`/customers/${doc.customerId}`} className="flex items-center gap-1 text-primary hover:underline">
              <User className="size-3" /> Customer
            </Link>
          )}
          {doc.vehicleId && (
            <Link href={`/fleet/${doc.vehicleId}`} className="flex items-center gap-1 text-primary hover:underline">
              <Car className="size-3" /> Vehicle
            </Link>
          )}
        </div>
      </div>
      {canDelete && <DocumentDeleteButton documentId={doc.id} />}
    </div>
  )
}

export { DocumentListItem }
