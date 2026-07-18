"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"

import { createClient } from "@/lib/supabase/server"

export interface AuthActionState {
  error?: string
  message?: string
}

function friendlyAuthError(message: string): string {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "That email and password don't match our records."
  }
  if (message.toLowerCase().includes("already registered")) {
    return "An account with this email already exists. Try signing in instead."
  }
  if (message.toLowerCase().includes("email not confirmed")) {
    return "Please confirm your email before signing in — check your inbox."
  }
  return message
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const next = String(formData.get("next") ?? "/overview")

  if (!email || !password) {
    return { error: "Enter your email and password." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: friendlyAuthError(error.message) }
  }

  redirect(next.startsWith("/") ? next : "/overview")
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const fullName = String(formData.get("fullName") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!fullName || !email || !password) {
    return { error: "Fill in your name, email and password." }
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." }
  }

  const supabase = await createClient()
  const origin = (await headers()).get("origin")

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    return { error: friendlyAuthError(error.message) }
  }

  // If email confirmation is required, Supabase returns a user with no
  // session yet. Otherwise the user is already signed in.
  if (!data.session) {
    return {
      message:
        "Check your inbox to confirm your account, then sign in to set up your company.",
    }
  }

  redirect("/onboarding")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/sign-in")
}
