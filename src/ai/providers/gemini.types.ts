/**
 * KoshurKart — Gemini REST API types
 * =================================================================
 * Local type definitions for the Gemini REST API wire format used by
 * `GeminiProvider`. These model the request/response shapes of the
 * `generateContent` and `streamGenerateContent` endpoints.
 *
 * Defined locally — NOT imported from any SDK — so the provider has
 * zero external dependencies beyond browser-native `fetch`.
 *
 * These types are internal to the provider layer. They are never
 * exported from the providers barrel; only `GeminiProvider` and its
 * config are public.
 */

/* ------------------------------------------------------------------ *
 * Shared building blocks
 * ------------------------------------------------------------------ */

/**
 * A single part of a Gemini content message. Exactly one of the
 * optional fields is present per part.
 */
export interface GeminiPart {
  /** Plain text content. */
  text?: string;
  /** A function call the model wants to make. */
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  /** A function result being sent back to the model. */
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

/**
 * A content message in the Gemini conversation format.
 * Gemini uses `"model"` where our types use `"assistant"`.
 */
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/* ------------------------------------------------------------------ *
 * Request types
 * ------------------------------------------------------------------ */

/** Generation configuration knobs. */
export interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

/** A function declaration for Gemini tool use. */
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/** A tool containing function declarations. */
export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

/**
 * The full request body for `generateContent` / `streamGenerateContent`.
 */
export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  tools?: GeminiTool[];
  generationConfig?: GeminiGenerationConfig;
}

/* ------------------------------------------------------------------ *
 * Response types
 * ------------------------------------------------------------------ */

/** Why Gemini stopped generating (upstream enum, uppercase). */
export type GeminiFinishReason =
  | "STOP"
  | "MAX_TOKENS"
  | "SAFETY"
  | "RECITATION"
  | "OTHER"
  | "FINISH_REASON_UNSPECIFIED";

/** A single candidate in a Gemini response. */
export interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: GeminiFinishReason;
  safetyRatings?: Array<{ category: string; probability: string }>;
}

/** Token usage metadata from a Gemini response. */
export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

/**
 * The full response body from `generateContent` / a single SSE chunk
 * from `streamGenerateContent`.
 */
export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

/** Error envelope returned by the Gemini API on failure. */
export interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
  };
}
