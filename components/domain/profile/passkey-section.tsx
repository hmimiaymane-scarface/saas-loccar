"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Fingerprint, Loader2, Trash2 } from "lucide-react"

import { browserSupportsWebAuthn, registerPasskey } from "@/lib/webauthn/client"
import { removePasskey, type PasskeyItem } from "@/app/(dashboard)/profile/actions"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

/** Roadmap phase 16 requirement 8 — "Enable Face ID / fingerprint
 * sign-in." Available to any signed-in employee (not gated by role —
 * this is a personal security setting, unlike company-wide /settings).
 * A registered device label defaults to the platform reported by the
 * browser (best-effort, not authoritative) so a list of several
 * passkeys is still meaningfully distinguishable later. */
function PasskeySection({ passkeys }: { passkeys: PasskeyItem[] }) {
  const router = useRouter()
  const [supported, setSupported] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browserSupportsWebAuthn reads navigator, unavailable during SSR; no user event exists to move this into instead.
    setSupported(browserSupportsWebAuthn())
  }, [])

  async function handleRegister() {
    setRegistering(true)
    setError(null)
    const label = /iphone|ipad/i.test(navigator.userAgent)
      ? "iPhone/iPad"
      : /android/i.test(navigator.userAgent)
        ? "Android device"
        : "This device"
    const result = await registerPasskey(label)
    setRegistering(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  function handleRemove(id: string) {
    setRemovingId(id)
    startTransition(async () => {
      await removePasskey(id)
      setRemovingId(null)
      setConfirmingId(null)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkey sign-in</CardTitle>
        <CardDescription>
          Use Face ID, a fingerprint, or your device&apos;s screen lock instead of typing your password — useful in
          the field on a phone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {passkeys.length > 0 && (
          <div className="flex flex-col divide-y divide-border">
            {passkeys.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-2.5">
                  <Fingerprint className="size-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{p.deviceLabel ?? "Unnamed device"}</span>
                    <span className="text-xs text-muted-foreground">
                      Added {formatDateTime(p.createdAt)}
                      {p.lastUsedAt ? ` · last used ${formatDateTime(p.lastUsedAt)}` : ""}
                    </span>
                  </div>
                </div>
                {confirmingId === p.id ? (
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingId(null)} disabled={removingId === p.id}>
                      Cancel
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => handleRemove(p.id)} disabled={removingId === p.id}>
                      {removingId === p.id && <Loader2 className="animate-spin" />}
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setConfirmingId(p.id)}
                    aria-label="Remove passkey"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {supported ? (
          <Button type="button" variant="outline" onClick={handleRegister} disabled={registering} className="w-fit">
            {registering ? <Loader2 className="animate-spin" /> : <Fingerprint />}
            Enable Face ID / fingerprint sign-in
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Passkeys aren&apos;t supported on this browser.</p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

export { PasskeySection }
