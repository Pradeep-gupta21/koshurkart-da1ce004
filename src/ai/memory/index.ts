/**
 * KoshurKart — AI memory barrel
 * =================================================================
 * Clean public surface for the memory framework. Import from here rather
 * than reaching into individual files:
 *
 *   import {
 *     ConversationMemory,
 *     UserMemory,
 *     SessionMemory,
 *     RetrievalMemory,
 *     ExtractiveSummarizer,
 *     InMemoryStore,
 *   } from "@/ai/memory";
 *   import type { MemoryRecord, MemoryContext, MemoryStore } from "@/ai/memory";
 *
 * The memory system is the *recall layer* agents compose alongside the tool
 * and planner layers: session scratch, conversation windows + summaries,
 * durable user facts/preferences, and embedding-free retrieval.
 *
 * This module ships only the *reusable architecture*. It is provider-
 * agnostic and free of marketplace logic: nothing here touches a database,
 * Supabase, the network, an API, or embeddings. The `MemoryStore` seam is
 * the single place a real backend would later plug in via dependency
 * injection — no memory class changes when it does.
 */

/* ---- Core types & result helpers -------------------------------- */
export type {
  Memory,
  MemoryRecord,
  AnyMemoryRecord,
  MemoryKind,
  MemoryScope,
  MemoryScopeLevel,
  MemoryStore,
  MemoryContext,
  MemoryResult,
  MemoryError,
  MemoryErrorCode,
  MemoryQuery,
  ScoredMemory,
  RetrievalStrategy,
  RetrievalScoringContext,
  Summarizer,
  SummarizeOptions,
  MemorySummary,
} from "./types";
export { memOk, memErr, isMemOk } from "./types";

/* ---- Base class & default store --------------------------------- */
export { BaseMemory, InMemoryStore } from "./base.memory";
export { SupabaseMemoryStore } from "./supabase.store";
export type { BaseMemoryConfig } from "./base.memory";

/* ---- Session scratch -------------------------------------------- */
export { SessionMemory, createSessionMemory } from "./session.memory";
export type { SessionEntry } from "./session.memory";

/* ---- Conversation history + windowing --------------------------- */
export {
  ConversationMemory,
  createConversationMemory,
} from "./conversation.memory";
export type {
  ConversationItem,
  ConversationMemoryConfig,
} from "./conversation.memory";

/* ---- Durable user memory ---------------------------------------- */
export { UserMemory, createUserMemory } from "./user.memory";
export type { UserFact, RememberOptions } from "./user.memory";

/* ---- Embedding-free retrieval ----------------------------------- */
export {
  RetrievalMemory,
  createRetrievalMemory,
  createKeywordRecencyStrategy,
} from "./retrieval.memory";
export type {
  RetrievableItem,
  KeywordRecencyOptions,
} from "./retrieval.memory";

/* ---- Summarizers ------------------------------------------------ */
export {
  ExtractiveSummarizer,
  AISummarizer,
  createSummarizer,
} from "./summarizer";
export type {
  ExtractiveSummarizerOptions,
  AISummarizerOptions,
} from "./summarizer";
