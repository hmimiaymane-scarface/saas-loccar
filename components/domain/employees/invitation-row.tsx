"use client"

import { useState, useTransition } from "react"
import { Link2, Check, X, Loader2 } from "lucide-react"

import { revokeInvitation } from "@/app/(dashboard)/employees/actions"
import { ROLE_LABELS } from "@/lib/roles"
import { formatDate } from "@/lib/format"
import type { TeamInvitation } from "@/types/rental"
import { Button } from "@/components/ui/button"

function InvitationRow({ invitation }: { invitation: TeamInvitation }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function copyLink() {
    const url = `${window.location.origin}/invite/${invitation.token}`
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function revoke() {
    setError(null)
    startTransition(async () => {
      const result = await revokeInvitation(invitation.id)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-dashed border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{invitation.email}</span>
        <span className="text-xs text-muted-foreground">
          {ROLE_LABELS[invitation.role]}
          {invitation.branchName ? ` · ${invitation.branchName}` : ""} · Expires {formatDate(invitation.expiresAt)}
        </span>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={copyLink}>
          {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        {confirming ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={revoke} disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Revoke
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="icon-sm" onClick={() => setConfirming(true)} title="Revoke invitation">
            <X className="size-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  )
}

export { InvitationRow }
