"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { signIn, type AuthActionState } from "@/app/(auth)/actions"
import { PasskeySignInButton } from "@/components/auth/passkey-sign-in-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const initialState: AuthActionState = {}

function SignInForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(signIn, initialState)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sign in</CardTitle>
        <CardDescription>Welcome back to your rental office.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? "/overview"} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.ma"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {state.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="mt-1 w-full">
            {isPending && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
        <PasskeySignInButton next={next} />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to Rental Office?{" "}
          <Link href="/sign-up" className="font-medium text-foreground hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export { SignInForm }
