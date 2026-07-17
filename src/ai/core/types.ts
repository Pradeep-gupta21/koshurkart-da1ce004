/**
 * Core types for the Koshur AI Identity Engine.
 * Provides enterprise-grade type safety for prompt generation,
 * identity configuration, and future extensibility (RAG, Memory, Tools).
 */

export interface AIIdentity {
  name: string;
  role: string;
  mission: string;
  traits: string[];
}

export interface AIPersonality {
  tone: string;
  style: string;
  communication: string[];
}

export interface AIGuardrails {
  identityProtection: string;
  informationIntegrity: string;
  epistemicHumility: string;
  operationalBoundaries: string;
  toneAndEngagement: string;
}

export interface AIOperationalConstraints {
  financial: string;
  infrastructure: string;
  policy: string;
  outbound: string;
  cultural: string;
}

export interface AIIdentityConfig {
  identity: AIIdentity;
  personality: AIPersonality;
  guardrails: AIGuardrails;
  constraints: AIOperationalConstraints;
}

export interface PromptContext {
  userId?: string;
  cartState?: any; // To be typed later
  currentTime?: string;
  [key: string]: any;
}

export interface PromptMemory {
  history: { role: 'user' | 'assistant' | 'system', content: string }[];
  summary?: string;
}

export interface PromptRAG {
  documents: { title: string, content: string }[];
}

export interface PromptTools {
  availableTools: { name: string, description: string }[];
}
