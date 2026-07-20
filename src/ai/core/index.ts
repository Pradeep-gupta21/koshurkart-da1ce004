/**
 * Main export file (Barrel) for the Koshur AI Engine.
 * Exposes a clean, unified API for the application layer.
 */

// Types
export * from './types';

// Identity Configuration
export { KOSHUR_AI_CONFIG } from '../identity/identity';

// Prompt Engine
export { PromptBuilder } from '../prompts/prompt-builder';
export { generateSystemPrompt } from '../prompts/system-prompt';
export type { SystemPromptOptions } from '../prompts/system-prompt';
