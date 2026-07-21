# The AI Platform Service (`askAI`)

## What it is

`lib/ai/service.ts#askAI(supabase, session, input)` is the one place any
server-side module asks an LLM a structured question and gets typed,
validated output back — the bible's Ch. 11 §13 ("AI as a Platform
Service"): *"AI should never be embedded directly into modules. Instead,
modules request intelligence... The AI layer remains reusable,
consistent, centralized."*

```ts
const result = await askAI(supabase, session, {
  purpose: "vehicle.summarize",
  prompt: "Summarize this vehicle's health...",
  schema: z.object({ healthSummary: z.string(), riskFactors: z.array(z.string()) }),
  allowedRoles: ["owner", "manager", "agent"],
})

if (result.ok) {
  // result.data is z.infer<typeof schema> — never raw text to parse
  // result.confidence is "high" | "medium" | "low"
} else {
  // result.error is a typed AskAiErrorCode — branch on it, never throws
}
```

Roadmap phases 06 (vehicle health/profitability), 08 (customer trust/
CLV), 10 (contract clause suggestions), and 12 (the Operations Feed) are
the intended callers — this phase (05) adds no new AI-powered feature
itself, only the reusable plumbing those phases build on.

## Design

- **Typed output only.** The caller supplies a zod `schema`; `askAI`
  runs `generateObject` against it via `lib/ai/models.ts`'s existing
  model resolution (same centralized model selection every other AI
  caller in this codebase uses — `resolveModel`/`resolveAvailableProvider`,
  unchanged from phase 03).
- **Coarse confidence, not fake precision.** Every response carries a
  top-level `confidence: "high" | "medium" | "low"` — `"high"` on a
  clean first try, `"medium"` if the first response didn't validate
  against `schema` and a retry was needed. `askAI` never invents
  per-field statistical confidence; a caller whose domain wants that
  (like phase 03's document extraction) builds it into its own schema
  the same way `lib/document-extraction.ts#field()` does.
- **Retries exactly once, only for a malformed response.** A
  provider error, rate limit, or timeout won't be fixed by immediately
  asking again — only a response that failed schema validation gets a
  second attempt.
- **Role-gated.** `allowedRoles` is checked against `session.role`
  before any model call — the same coarse allow-list convention
  `lib/auth/guard.ts#requireRole` already uses everywhere else in this
  codebase (there is no finer-grained permission system to build
  against yet; see "Known limitations" below).
- **Never throws.** Every expected failure — `permission_denied`,
  `provider_not_configured`, `timeout`, `rate_limited`,
  `invalid_response`, `provider_error` — is a typed result. This matters
  more here than in phase 03: this service will be called from
  background jobs (phase 12) where nothing is watching for an unhandled
  rejection.
- **Logged.** Every call — success or failure — writes a row to
  `ai_usage_log` (`purpose`, `provider`, `model`, `success`,
  `error_code`), the seed of real cost/usage tracking once phase 12's
  background jobs start calling this frequently.

## Why `ai_usage_log` is its own table, not the phase 01 event backbone

`activity_log.entity_type` is a closed enum of concrete business
entities (customer, vehicle, reservation, ...) an event is *about*. An
AI service call is a cross-cutting infrastructure concern, not tied to
one entity — forcing it into that schema would mean either a fake
`entity_id` or growing the enum for every future AI purpose. A
dedicated table is where token/cost columns will naturally extend later,
without touching the event backbone's shape.

## Why the AI Assistant chat feature wasn't refactored onto this

The chat assistant (`app/api/ai-assistant/chat/route.ts`,
`lib/ai/tools.ts`) is a genuinely different shape: a multi-turn,
streamed, tool-calling conversation (`streamText` + `stopWhen` +
`toUIMessageStreamResponse()`), not "ask one question, get one typed
answer." The two already share the piece that actually needed
centralizing — `lib/ai/models.ts`'s model resolution — and
`lib/ai/tools.ts`'s tools are data lookups and proposal-writers, not
raw model calls, so there was nothing duplicated left to extract.
Forcing the chat loop onto `askAI` would risk its streaming/tool-calling
behavior for no real architectural gain, which is exactly the tradeoff
the phase brief says not to make. The chat assistant's observable
behavior is unchanged by this phase.

## Known limitations (intentional, for a future phase)

- **`askAI` only supports `generateObject`-shaped calls** — one prompt
  in, one typed object out. It doesn't stream, and it isn't a fit for
  the chat assistant's multi-turn tool-calling loop (see above).
- **Permission checking is role-only**, matching
  `requireRole`'s allow-list convention — there's no field-level or
  data-scoped permission model in this codebase yet ("an agent can see
  vehicle X's health score but not its acquisition cost" isn't
  expressible today). If a future phase needs that, it's separable
  work, not something this phase's `allowedRoles` parameter can do.
- **Confidence is coarse and self-derived from retry behavior**, not a
  statistical measure — same caveat as phase 03's per-field confidence,
  generalized: it's a signal for "was this a clean answer," not a
  calibrated probability.
- **`purpose` is a free-form string**, not a validated enum — there's no
  fixed list of AI capabilities yet since no phase has used this service
  for a real feature. A future phase might want to constrain it once
  real purposes exist.
- **The two new migrations (`ai_usage_log`) haven't been applied to the
  live Supabase project** — same situation as every prior phase's new
  tables in this environment (no Docker/Supabase CLI available
  locally). Verified via unit tests with a mocked Supabase client
  instead.
