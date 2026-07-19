import { openai } from "@ai-sdk/openai"
import { anthropic } from "@ai-sdk/anthropic"
import type { LanguageModel } from "ai"

export type AiProvider = "openai" | "anthropic"

export const AI_PROVIDERS: AiProvider[] = ["openai", "anthropic"]

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Claude",
  openai: "GPT",
}

/** Model ids are intentionally centralized here — one place to update
 * when a provider ships a new default. Callers never hardcode a model
 * string themselves. */
export function resolveModel(provider: AiProvider): LanguageModel {
  switch (provider) {
    case "anthropic":
      return anthropic("claude-sonnet-5")
    case "openai":
      return openai("gpt-4o")
  }
}

export function isConfigured(provider: AiProvider): boolean {
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY)
  return Boolean(process.env.OPENAI_API_KEY)
}
