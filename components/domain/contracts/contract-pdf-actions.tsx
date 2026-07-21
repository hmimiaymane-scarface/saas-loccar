"use client"

import { useTransition } from "react"
import { Download, Printer } from "lucide-react"

import { logContractPrintedAction, logContractDownloadedAction } from "@/app/(dashboard)/contract-templates/actions"
import { Button } from "@/components/ui/button"

/** Roadmap phase 11 requirement 9 — logs before acting so the audit
 * trail reflects intent even if the user closes the tab mid-download.
 * "Printed" here means this in-app button (which calls the browser's
 * native print dialog via `window.print()`); a raw Ctrl+P bypasses
 * this entirely — a known, documented gap (see
 * docs/contract-lifecycle.md), not something a web app can reliably
 * intercept. */
function ContractPdfActions({ contractId, pdfUrl }: { contractId: string; pdfUrl: string | null }) {
  const [, startTransition] = useTransition()

  function handlePrint() {
    startTransition(async () => {
      await logContractPrintedAction(contractId)
    })
    window.print()
  }

  function handleDownload() {
    startTransition(async () => {
      await logContractDownloadedAction(contractId)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={handlePrint}>
        <Printer />
        Print
      </Button>
      {pdfUrl && (
        <Button asChild onClick={handleDownload}>
          <a href={pdfUrl} target="_blank" rel="noreferrer">
            <Download />
            Download PDF
          </a>
        </Button>
      )}
    </div>
  )
}

export { ContractPdfActions }
