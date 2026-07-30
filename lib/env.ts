/**
 * Typed, centralized environment-variable access.
 *
 * Every other module reads Supabase config through this file instead of
 * touching `process.env` directly, so there is exactly one place that knows
 * what's required, what's optional, and what "not configured yet" means.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * True once real Supabase credentials are present. Used to decide between
 * live Supabase data and local mock data — see `lib/data.ts`.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const env = {
  supabaseUrl: supabaseUrl ?? "",
  supabaseAnonKey: supabaseAnonKey ?? "",
}

// Roadmap phase 44 (Push Notifications). The public key has to reach
// the browser (for `pushManager.subscribe({ applicationServerKey })`),
// hence `NEXT_PUBLIC_`; the private key never leaves the server — only
// `lib/notifications/channels/push.ts` reads it, to sign outgoing
// push messages. Generate a real pair with `npx web-push generate-vapid-keys`
// (see .env.example).
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT

/** True once a real VAPID key pair exists — same "honest configured
 * flag" convention as `isSupabaseConfigured`. The `push` notification
 * channel (`lib/notifications/channels/index.ts`) stays an inert
 * placeholder until this is true. */
export const isPushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject)

export const pushEnv = {
  vapidPublicKey: vapidPublicKey ?? "",
  vapidPrivateKey: vapidPrivateKey ?? "",
  vapidSubject: vapidSubject ?? "",
}

/**
 * Throws with a clear message instead of letting the Supabase SDK fail with
 * an opaque "Invalid URL" error deep in a request. Call this at the top of
 * any code path that requires a real Supabase connection (auth, RLS-backed
 * queries) — never at module load time, so the app can still boot and show
 * mock data or a setup notice when credentials are missing.
 */
export function requireSupabaseEnv() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)."
    )
  }
  return { supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey }
}
