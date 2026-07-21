"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, PenLine, CheckCircle2 } from "lucide-react"

import { addSignatureAction } from "@/app/(dashboard)/contract-templates/actions"
import { hasRequiredSignatures, type SignerType } from "@/lib/contracts/lifecycle"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const SIGNER_LABELS: Record<SignerType, string> = {
  customer: "Customer",
  additional_driver: "Additional driver",
  employee: "Employee",
  manager: "Manager",
}

interface SignatureItem {
  id: string
  signerType: SignerType
  signerName: string
  signedAt: string
}

/**
 * Roadmap phase 11 requirement 4 — the actual capture UI for the
 * documented mechanism: a typed full name plus an explicit
 * confirmation checkbox, not a drawn signature. The confirmation
 * checkbox has no server-side equivalent to verify beyond the name
 * itself; it exists so the signer has to take one deliberate,
 * unambiguous action rather than the name field alone quietly
 * "counting" as a signature.
 */
function ContractSignatureSection({
  contractId,
  status,
  signatures,
}: {
  contractId: string
  status: string
  signatures: SignatureItem[]
}) {
  const router = useRouter()
  const [signerType, setSignerType] = useState<SignerType>("customer")
  const [signerName, setSignerName] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const canSign = status === "awaiting_signature"
  const signedTypes = signatures.map((s) => s.signerType)
  const availableTypes = (["customer", "employee", "manager", "additional_driver"] as SignerType[]).filter((t) => !signedTypes.includes(t))
  const fullyReady = hasRequiredSignatures(signedTypes)

  function submit() {
    if (!signerName.trim() || !confirmed) return
    setError(null)
    startTransition(async () => {
      const result = await addSignatureAction({ contractId, signerType, signerName: signerName.trim() })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSignerName("")
      setConfirmed(false)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signatures</CardTitle>
        <CardDescription>
          Typed name + explicit confirmation, not a drawn or certified e-signature — see docs/contract-lifecycle.md.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {signatures.length > 0 && (
          <div className="flex flex-col gap-2">
            {signatures.map((sig) => (
              <div key={sig.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                  {SIGNER_LABELS[sig.signerType]}: {sig.signerName}
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(sig.signedAt)}</span>
              </div>
            ))}
          </div>
        )}

        {canSign && availableTypes.length > 0 && (
          <>
            {signatures.length > 0 && <Separator />}
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="signerType">Signer</Label>
                  <NativeSelect id="signerType" value={signerType} onChange={(e) => setSignerType(e.target.value as SignerType)}>
                    {availableTypes.map((t) => (
                      <option key={t} value={t}>
                        {SIGNER_LABELS[t]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="signerName">Full name</Label>
                  <Input id="signerName" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Type full legal name" />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-border"
                />
                I confirm this represents {signerName.trim() || "the signer"}&apos;s agreement to this contract, typed by them or on their explicit
                behalf.
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end">
                <Button size="sm" disabled={pending || !signerName.trim() || !confirmed} onClick={submit}>
                  {pending ? <Loader2 className="animate-spin" /> : <PenLine />}
                  Record signature
                </Button>
              </div>
            </div>
          </>
        )}

        {!canSign && signatures.length === 0 && (
          <p className="text-sm text-muted-foreground">Signatures can be collected once this contract is sent for signature.</p>
        )}
        {canSign && !fullyReady && (
          <p className="text-xs text-muted-foreground">Needs both a customer and an employee signature before this contract is signed.</p>
        )}
      </CardContent>
    </Card>
  )
}

export { ContractSignatureSection }
