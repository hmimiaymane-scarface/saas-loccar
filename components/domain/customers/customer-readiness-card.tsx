"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2 } from "lucide-react"

import type { RentalDocument } from "@/types/rental"
import type { ReturningCustomerReadiness } from "@/lib/customer-readiness"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { DocumentUploadRow, type DocumentSlotDef } from "@/components/domain/documents/document-upload-row"

const IDENTITY_SLOT: DocumentSlotDef = { category: "identity_document", label: "Identity document" }

/**
 * Roadmap phase 09 requirement 4's "interrupt" — surfaced on the
 * Customer Command Center itself (not just inside the reservation
 * flow), so the exact same readiness check that gates the fast path
 * is visible and fixable before anyone even starts a rental. The fix
 * for a missing/expired identity document is a real, working upload
 * right here (reusing the same `DocumentUploadRow` the pickup wizard
 * uses) — not a dead link. The licence date has no equivalent
 * one-field-fix component of its own; that's part of the existing
 * "Edit" customer form already in the page header, so this just says
 * so rather than duplicating that form.
 */
function CustomerReadinessCard({
  companyId,
  customerId,
  readiness,
  identityDocument,
}: {
  companyId: string
  customerId: string
  readiness: ReturningCustomerReadiness
  identityDocument?: RentalDocument
}) {
  const [uploaded, setUploaded] = useState<RentalDocument | undefined>(identityDocument)
  const hasIdentityIssue = readiness.issues.some((i) => i.type === "identity_missing" || i.type === "identity_expired")
  const hasLicenceIssue = readiness.issues.some((i) => i.type === "licence_missing" || i.type === "licence_expired")
  const identityExpired = readiness.issues.some((i) => i.type === "identity_expired")
  const licenceExpired = readiness.issues.some((i) => i.type === "licence_expired")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rental readiness</CardTitle>
        <CardDescription>What&apos;s needed before this customer can skip straight to vehicle selection on a new rental.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {readiness.ready ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            Licence and ID are on file and valid — ready for the fast path.
          </p>
        ) : (
          <>
            {hasLicenceIssue && (
              <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0" />
                {licenceExpired ? "Driving licence has expired — update it from Edit." : "No driving licence expiry on file — set it from Edit."}
              </p>
            )}
            {hasIdentityIssue && (
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-4 shrink-0" />
                  {identityExpired ? "Identity document has expired." : "No identity document on file."}
                </p>
                <DocumentUploadRow
                  slot={IDENTITY_SLOT}
                  companyId={companyId}
                  customerId={customerId}
                  existing={uploaded}
                  onUploaded={setUploaded}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export { CustomerReadinessCard }
