import { generateObject, NoObjectGeneratedError, APICallError } from "ai"
import type { z } from "zod"

import { resolveModel, resolveAvailableProvider, type AiProvider } from "@/lib/ai/models"
import { createClient } from "@/lib/supabase/server"
import type { SessionContext } from "@/lib/auth/session"
import type { EmployeeRole } from "@/types/rental"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * The AI Platform Service layer (roadmap phase 05 — bible Ch. 11 §13,
 * "AI should never be embedded directly into modules. Instead, modules
 * request intelligence... The AI layer remains reusable, consistent,
 * centralized"). Every server-side module that needs an LLM's judgment
 * — vehicle health scoring (phase 06), customer trust scoring (phase
 * 08), contract clause suggestions (phase 10), the Operations Feed
 * (phase 12) — calls askAI() instead of building its own prompt/model/
 * error-handling plumbing the way phase 03's document extraction did.
 *
 * Deliberately NOT used by the AI Assistant chat feature
 * (app/api/ai-assistant/chat/route.ts) — that's a multi-turn,
 * tool-calling, streamed conversation, a genuinely different shape from
 * "ask one structured question, get one typed answer back." Forcing it
 * onto this service would risk the chat feature's observable behavior
 * for no real gain; both share lib/ai/models.ts for model selection,
 * which is the piece that actually needed centralizing. See
 * docs/ai-service.md.
 */

export type AskAiConfidence = "high" | "medium" | "low"

export type AskAiErrorCode =
  | "permission_denied"
  | "provider_not_configured"
  | "timeout"
  | "rate_limited"
  | "invalid_response"
  | "provider_error"

export type AskAiResult<T> =
  | { ok: true; data: T; confidence: AskAiConfidence; modelId: string }
  | { ok: false; error: AskAiErrorCode; message: string }

/**
 * A background job (roadmap phase 12's operations-feed observers) has
 * no signed-in user to build a real `SessionContext` from at all —
 * `ai_usage_log.actor_id`/`.role` were deliberately designed for this
 * from the start (see that table's own migration comment: "no human
 * actor at all (role: 'system'/'ai')," and `askAI`'s own doc comment:
 * "this runs from background jobs too"). Rather than fabricating a
 * fake human role just to satisfy `allowedRoles`, a system caller
 * skips that check entirely — the job itself already decided this
 * call should happen; there's no human permission to gate. `role` is
 * plain `text` on `ai_usage_log`, not FK'd/checked against
 * `EmployeeRole`, so `"system"` is a legitimate, already-anticipated
 * value there.
 */
export interface SystemCaller {
  userId: null
  role: "system"
  company: { id: string }
}

export type AskAiCaller = SessionContext | SystemCaller

export interface AskAiInput<TSchema extends z.ZodTypeAny> {
  /** Which module/feature is asking, conventionally "domain.action" —
   * e.g. "vehicle.summarize", "customer.trust_score". Free-form (no DB
   * enum): logged to ai_usage_log for future cost/usage breakdowns, but
   * this phase adds no new AI features itself, so there's no fixed list
   * to validate against yet. */
  purpose: string
  /** The full prompt — already assembled by the caller. This service
   * knows nothing about vehicles or customers, only prompts and schemas
   * (mirrors the bible's "modules request intelligence" framing: domain
   * knowledge stays in the calling module, not here). */
  prompt: string
  /** Expected output shape, validated with zod. A caller whose domain
   * benefits from per-field confidence (like phase 03's extraction
   * fields) should build that into its own schema — this service only
   * adds one coarse top-level confidence signal on top (see
   * AskAiConfidence), never fabricates per-field precision that isn't
   * really there. */
  schema: TSchema
  /** Roles allowed to make this specific call — same allow-list
   * convention as lib/auth/guard.ts#requireRole. Checked before any
   * model call is made. */
  allowedRoles: EmployeeRole[]
  /** Roadmap phase 17 — a caller that needs finer granularity than
   * `allowedRoles` (e.g. "any role can ask, but only if they can
   * actually see financial data") can additionally name a
   * has_permission() key here. Checked with the same has_permission()
   * RPC the RLS layer uses, via the `supabase` client already passed
   * to this function — a system caller skips this too, same reasoning
   * as the allowedRoles bypass above. Optional: most askAI() callers
   * are adequately gated by allowedRoles alone. */
  requiredPermission?: string
  /** Optional provider override; defaults to resolveAvailableProvider(). */
  provider?: AiProvider
}

function classifyError(err: unknown): { error: AskAiErrorCode; message: string } {
  if (NoObjectGeneratedError.isInstance(err)) {
    return { error: "invalid_response", message: "The AI response didn't match the expected shape." }
  }
  if (APICallError.isInstance(err)) {
    if (err.statusCode === 429) {
      return { error: "rate_limited", message: "The AI provider is rate-limiting requests right now — try again shortly." }
    }
    return { error: "provider_error", message: "The AI provider returned an error." }
  }
  if (err instanceof Error && (err.name === "AbortError" || /timeout/i.test(err.message))) {
    return { error: "timeout", message: "The AI request timed out." }
  }
  return { error: "provider_error", message: "The AI request failed unexpectedly." }
}

/** Best-effort, matches lib/activity-log.ts#recordEvent's convention:
 * not wrapped in try/catch, because an ordinary DB-level failure (RLS
 * denial, constraint violation) resolves this promise with an `error`
 * field rather than rejecting it — Supabase's client throws only on a
 * true network-level failure, same edge case recordEvent already
 * accepts without guarding against it. Either way, the caller's real
 * result (already computed above) is what gets returned, never this. */
async function logUsage(
  supabase: SupabaseServerClient,
  session: AskAiCaller,
  purpose: string,
  provider: AiProvider,
  modelId: string,
  success: boolean,
  errorCode?: AskAiErrorCode
) {
  await supabase.from("ai_usage_log").insert({
    company_id: session.company.id,
    actor_id: session.userId,
    role: session.role,
    purpose,
    provider,
    model: modelId,
    success,
    error_code: errorCode ?? null,
  })
}

/**
 * Asks an LLM one structured question and returns typed, validated
 * output — never raw text a caller has to parse itself. Retries exactly
 * once, and only when the first attempt's response didn't match
 * `schema` (a genuine provider/rate-limit/timeout failure won't be
 * fixed by immediately asking again). Never throws: every expected
 * failure mode (missing permission, no provider configured, timeout,
 * rate limit, malformed response, generic provider error) returns a
 * typed result instead — this runs from background jobs (phase 12) too,
 * where nothing is watching for an unhandled rejection.
 */
export async function askAI<TSchema extends z.ZodTypeAny>(
  supabase: SupabaseServerClient,
  session: AskAiCaller,
  input: AskAiInput<TSchema>
): Promise<AskAiResult<z.infer<TSchema>>> {
  if (session.role !== "system" && !input.allowedRoles.includes(session.role)) {
    return { ok: false, error: "permission_denied", message: "Your role doesn't have access to this AI capability." }
  }

  if (session.role !== "system" && input.requiredPermission) {
    const { data: allowed } = await supabase.rpc("has_permission", {
      target_company_id: session.company.id,
      key: input.requiredPermission,
    })
    if (!allowed) {
      return { ok: false, error: "permission_denied", message: "Your role doesn't have access to this AI capability." }
    }
  }

  const provider = input.provider ?? resolveAvailableProvider()
  if (!provider) {
    return {
      ok: false,
      error: "provider_not_configured",
      message: "No AI provider is configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    }
  }

  const model = resolveModel(provider)
  // LanguageModel is `string | LanguageModelV2` — resolveModel() always
  // returns a provider object in practice, but the type doesn't
  // guarantee it (same caveat as lib/document-extraction.ts).
  const modelId = typeof model === "string" ? model : model.modelId

  // generateObject's return type resolves against the concrete schema
  // shape via a conditional type that doesn't simplify cleanly through a
  // generic `TSchema extends z.ZodTypeAny` parameter — the cast below is
  // safe because generateObject already validated `object` against
  // `input.schema` internally before returning it.
  try {
    const { object } = await generateObject({ model, schema: input.schema, prompt: input.prompt })
    await logUsage(supabase, session, input.purpose, provider, modelId, true)
    return { ok: true, data: object as z.infer<TSchema>, confidence: "high", modelId }
  } catch (firstErr) {
    const firstClassified = classifyError(firstErr)
    if (firstClassified.error !== "invalid_response") {
      await logUsage(supabase, session, input.purpose, provider, modelId, false, firstClassified.error)
      return { ok: false, ...firstClassified }
    }

    try {
      const { object } = await generateObject({ model, schema: input.schema, prompt: input.prompt })
      await logUsage(supabase, session, input.purpose, provider, modelId, true)
      return { ok: true, data: object as z.infer<TSchema>, confidence: "medium", modelId }
    } catch (secondErr) {
      const secondClassified = classifyError(secondErr)
      await logUsage(supabase, session, input.purpose, provider, modelId, false, secondClassified.error)
      return { ok: false, ...secondClassified }
    }
  }
}
