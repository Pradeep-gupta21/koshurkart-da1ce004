/**
 * KoshurKart — AI providers barrel
 * =================================================================
 * Clean public surface for the provider layer. Import providers from
 * here rather than reaching into individual files:
 *
 *   import { MockProvider, createMockProvider } from "@/ai/providers";
 *   import { AIService } from "@/ai/services/ai.service";
 *
 *   const ai = new AIService({ provider: createMockProvider() });
 *
 * Any object implementing the `AIProvider` contract (see
 * src/ai/types/chat.ts) can be injected into `AIService` — that is the
 * dependency-injection seam. No real vendor (OpenAI / Anthropic / Gemini)
 * is connected yet; only the offline MockProvider ships today.
 */

// Re-export the provider contract for convenience so consumers can type
// their own adapters against it without a second import path.
export type { AIProvider } from "@/ai/types/chat";

// Base class for building new providers.
export { BaseProvider, DETERMINISTIC_TIMESTAMP } from "./base.provider";

// Offline, deterministic mock provider.
export { MockProvider, createMockProvider } from "./mock.provider";
export type { MockProviderOptions } from "./mock.provider";

// Real Gemini provider — calls the Gemini REST API via fetch.
export {
  GeminiProvider,
  createGeminiProvider,
  DEFAULT_GEMINI_MODEL,
} from "./gemini.provider";
export type { GeminiProviderConfig } from "./gemini.provider";

// Real Groq provider — calls Groq's OpenAI-compatible API via direct fetch().
export {
  GroqProvider,
  createGroqProvider,
  DEFAULT_GROQ_MODEL,
} from "./groq.provider";
export type { GroqProviderConfig } from "./groq.provider";

// Default provider used when none is explicitly chosen. Currently the mock,
// since no composition root provides an API key. Swap to GroqProvider
// (or another adapter) once a key source is wired up.
export { MockProvider as DefaultProvider } from "./mock.provider";

