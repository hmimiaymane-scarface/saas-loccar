"use client"

import { useEffect, useState, useTransition } from "react"
import { Download, Printer, Share } from "lucide-react"

import { logContractPrintedAction, logContractDownloadedAction } from "@/app/(dashboard)/contract-templates/actions"
import { Button } from "@/components/ui/button"

/** Roadmap phase 11 requirement 9 — logs before acting so the audit
 * trail reflects intent even if the user closes the tab mid-download.
 * "Printed" here means this in-app button (which calls the browser's
 * native print dialog via `window.print()`); a raw Ctrl+P bypasses
 * this entirely — a known, documented gap (see
 * docs/contract-lifecycle.md), not something a web app can reliably
 * intercept.
 *
 * Roadmap phase 16 requirement 9 — "printing explicitly is NOT
 * mobile's job." The Print button (`window.print()`) is hidden below
 * the `lg` breakpoint via CSS, same responsive convention the rest of
 * this app uses — mobile browsers handle the native print dialog
 * inconsistently, and the bible is explicit this isn't mobile's
 * responsibility anyway. In its place, a Share button appears when the
 * Web Share API is available (most mobile browsers, no desktop
 * browsers as of this writing) — handing a generated contract off to
 * WhatsApp/email/AirDrop is the realistic field equivalent of "print
 * it," not a print dialog. Download stays available everywhere; it's
 * the one action that always works regardless of device. */
function ContractPdfActions({ contractId, pdfUrl }: { contractId: string; pdfUrl: string | null }) {
  const [, startTransition] = useTransition()
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator.share is a browser-only capability check, unavailable during SSR; no user event exists to move this into instead.
    setCanShare(typeof navigator !== "undefined" && "share" in navigator)
  }, [])

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

  async function handleShare() {
    if (!pdfUrl) return
    startTransition(async () => {
      await logContractDownloadedAction(contractId)
    })
    try {
      await navigator.share({ title: "Rental contract", url: pdfUrl })
    } catch {
      // Cancelled by the user, or share failed silently — Download
      // stays available as the reliable fallback either way.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={handlePrint} className="hidden lg:inline-flex">
        <Printer />
        Print
      </Button>
      {pdfUrl && canShare && (
        <Button variant="outline" onClick={handleShare} className="lg:hidden">
          <Share />
          Share
        </Button>
      )}
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
