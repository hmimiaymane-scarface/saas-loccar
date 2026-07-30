"use client"

import { useEffect, useState, useTransition } from "react"
import { Download, Printer, Share } from "lucide-react"

import { logContractPrintedAction, logContractDownloadedAction } from "@/app/(dashboard)/contract-templates/actions"
import { buildContractMessage } from "@/lib/whatsapp-messages"
import { Button } from "@/components/ui/button"
import { WhatsAppButton } from "@/components/domain/whatsapp-button"

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
interface ContractPdfActionsProps {
  contractId: string
  pdfUrl: string | null
  customerId: string
  customerName: string
  customerPhone: string | null
  reservationId: string
  reservationReference: string
}

function ContractPdfActions({
  contractId,
  pdfUrl,
  customerId,
  customerName,
  customerPhone,
  reservationId,
  reservationReference,
}: ContractPdfActionsProps) {
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
      {/* Roadmap phase 26 built this as a disabled stub — "no messaging
          integration exists anywhere in this app yet." Roadmap phase 45
          found that framing only holds for a real Business-API/email
          integration; WhatsApp's own `wa.me` click-to-chat link needs
          neither and is a real, working "Send" now. Email stays out of
          scope for this phase (no deep-link equivalent without knowing
          the recipient wants to open their own mail client, and the
          brief only names WhatsApp/Call) — not re-added as a stub here
          since a single real action beats a bundle of one working button
          and one still-fake one. */}
      <WhatsAppButton
        phone={customerPhone}
        label="Send"
        message={buildContractMessage({ customerName, reference: reservationReference, pdfUrl })}
        logEvent={{
          type: "whatsapp_contract_sent",
          customerId,
          reservationId,
          title: `Contract sent to ${customerName}`,
          description: `Reservation ${reservationReference}`,
        }}
      />
    </div>
  )
}

export { ContractPdfActions }
