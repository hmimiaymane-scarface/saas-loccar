"use client"

import { useSearchParams } from "next/navigation"
import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Appends the page's current filters to the export URL so the download
 * always matches what's on screen — "exports must respect the selected
 * filters" from the phase brief, made structural rather than a separate
 * export-filter UI to keep in sync. */
function ExportButton({ resource }: { resource: string }) {
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.delete("page")

  return (
    <Button variant="outline" asChild>
      <a href={`/api/exports/${resource}?${params.toString()}`}>
        <Download />
        Export CSV
      </a>
    </Button>
  )
}

export { ExportButton }
