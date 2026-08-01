"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Fingerprint, Loader2 } from "lucide-react"

import { browserSupportsWebAuthn, signInWithPasskey } from "@/lib/webauthn/client"
import { Button } from "@/components/ui/button"

/** Roadmap phase 16 requirement 8. Rendered only once mounted and only
 * when the browser actually supports WebAuthn — most desktop browsers
 * do, but this keeps the button from appearing somewhere it can't
 * possibly work rather than showing it and failing on click. */
function PasskeySignInButton({ next }: { next?: string }) {
  const router = useRouter()
  const [supported, setSupported] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browserSupportsWebAuthn reads navigator, unavailable during SSR; no user event exists to move this into instead.
    setSupported(browserSupportsWebAuthn())
  }, [])

  if (!supported) return null

  async function handleClick() {
    setPending(true)
    setError(null)
    const result = await signInWithPasskey()
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(next ?? "/overview")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant="outline" className="w-full" onClick={handleClick} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Fingerprint />}
        Use Face ID / fingerprint
      </Button>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { PasskeySignInButton }
